from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import models
from database import engine
from config import settings
from routers import menus, users, orders, admin

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Holy-Order API", description="교회 카페 주문 시스템 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
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
