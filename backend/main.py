from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import models
from database import engine
from config import settings
from routers import menus, users, orders, admin, pwa

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Holy-Order API", description="교회 카페 주문 시스템 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import asyncio
from websocket import manager
from fastapi import WebSocket, WebSocketDisconnect

app.include_router(menus.router)
app.include_router(users.router)
app.include_router(orders.router)
app.include_router(admin.router)
app.include_router(pwa.router)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            try:
                # 30초 동안 클라이언트로부터 메시지가 없으면 타임아웃 발생
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                # 타임아웃 발생 시 서버에서 ping을 보내 연결 상태 확인 및 유지
                await manager.send_personal_message({"type": "ping"}, websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

@app.get("/")
def read_root():
    return {"message": "Welcome to Holy-Order API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

# -----------------------------------------------------
# 임시 데이터베이스 관리 엔드포인트 (테스트용 비밀 스위치)
# -----------------------------------------------------
import seed
from database import SessionLocal

@app.get("/api/v1/dev/seed")
def seed_database():
    db = SessionLocal()
    try:
        seed.create_admin_if_not_exists(db)
        seed.create_settings_if_not_exists(db)
        import models
        if db.query(models.Category).count() == 0:
            seed.seed_test_data(db)
        return {"success": True, "message": "테스트 데이터가 성공적으로 주입되었습니다! 이제 관리자 로그인이 가능합니다."}
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        return {"success": False, "message": f"오류 발생: {str(e)}\n\n{error_trace}"}
    finally:
        db.close()

@app.get("/api/v1/dev/clear")
def clear_database():
    db = SessionLocal()
    try:
        seed.clear_test_data(db)
        seed.create_admin_if_not_exists(db)
        seed.create_settings_if_not_exists(db)
        return {"success": True, "message": "테스트 데이터가 깔끔하게 삭제되었습니다. (최고 관리자 계정은 유지됨)"}
    except Exception as e:
        return {"success": False, "message": f"오류 발생: {str(e)}"}
    finally:
        db.close()

from sqlalchemy import text
from database import SessionLocal

def run_auto_migrations():
    db = SessionLocal()
    try:
        # 1. 주문 관련 스키마 (Order)
        db.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;"))
        db.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;"))
        db.execute(text("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS menu_image_url_snapshot VARCHAR;"))
        
        # 2. 마스터 데이터 소프트 삭제용 (User, Category, Menu, etc)
        db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;"))
        db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;"))
        db.execute(text("ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;"))
        db.execute(text("ALTER TABLE menus ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;"))
        db.execute(text("ALTER TABLE menu_options ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;"))
        db.execute(text("ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;"))
        
        # 3. 설정 테이블 컬럼
        db.execute(text("ALTER TABLE settings ADD COLUMN IF NOT EXISTS toss_enabled BOOLEAN DEFAULT FALSE;"))
        db.execute(text("ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_price BOOLEAN DEFAULT TRUE;"))
        
        # 4. PWA 설치 및 기기 추적 테이블 / 주문 연결 컬럼
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS pwa_installations (
                id SERIAL PRIMARY KEY,
                installation_id VARCHAR(64) NOT NULL,
                app_type VARCHAR(20) NOT NULL,
                platform VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
                browser_family VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
                first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                first_standalone_at TIMESTAMP WITH TIME ZONE,
                last_standalone_at TIMESTAMP WITH TIME ZONE,
                last_detection_method VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
                push_permission VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
                related_app_installed BOOLEAN,
                admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_pwa_installation_id_app_type UNIQUE (installation_id, app_type)
            );
        """))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_pwa_installations_installation_id ON pwa_installations (installation_id);"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_pwa_installations_last_seen_at ON pwa_installations (last_seen_at);"))
        db.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS pwa_installation_id INTEGER REFERENCES pwa_installations(id);"))

        # admin_id 외래키가 users.id를 참조하던 잘못된 제약조건 수정 (admins.id 참조)
        try:
            db.execute(text("ALTER TABLE pwa_installations DROP CONSTRAINT IF EXISTS pwa_installations_admin_id_fkey;"))
            db.execute(text("""
                UPDATE pwa_installations p
                SET admin_id = NULL
                WHERE admin_id IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM admins a WHERE a.id = p.admin_id
                  );
            """))
            db.execute(text("""
                ALTER TABLE pwa_installations
                ADD CONSTRAINT pwa_installations_admin_id_fkey
                FOREIGN KEY (admin_id)
                REFERENCES admins(id)
                ON DELETE SET NULL;
            """))
        except Exception as fk_err:
            print(f"[AutoMigrate] FK migration notice: {fk_err}")

        db.commit()
        print("[AutoMigrate] Database schema updated successfully.")
    except Exception as e:
        db.rollback()
        print(f"[AutoMigrate] Migration warning: {e}")
    finally:
        db.close()

# 앱 실행 시 자동 스키마 마이그레이션 실행
run_auto_migrations()

@app.get("/api/v1/dev/migrate")
def migrate_database():
    run_auto_migrations()
    return {"success": True, "message": "데이터베이스 마이그레이션이 성공적으로 완료되었습니다."}
