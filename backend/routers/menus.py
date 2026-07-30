from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session, joinedload
from typing import List

import models, schemas
from database import get_db

router = APIRouter(prefix="/api/v1", tags=["menus"])

@router.get("/categories", response_model=schemas.StandardResponse[List[schemas.CategoryWithMenusResponse]])
def get_categories_with_menus(db: Session = Depends(get_db)):
    categories = db.query(models.Category).filter(
        models.Category.is_active == True
    ).options(
        # 메뉴와 옵션을 미리 로딩 (N+1 쿼리 방지)
        joinedload(models.Category.menus).joinedload(models.Menu.options)
    ).order_by(models.Category.display_order).all()

    # 각 카테고리의 비활성 메뉴 제외 및 품절(is_available=False) 메뉴 하단 정렬
    for category in categories:
        category.menus = sorted(
            [menu for menu in category.menus if menu.is_active],
            key=lambda m: (not m.is_available, m.display_order)
        )

    return schemas.StandardResponse(
        success=True,
        data=categories,
        message="메뉴 목록을 가져왔습니다."
    )

@router.get("/settings", response_model=schemas.StandardResponse[schemas.SettingResponse])
def get_public_settings(db: Session = Depends(get_db)):
    """인증 없이 접근 가능한 공개 설정 조회 (계좌 정보, 영업 여부 등 주문 화면에서 사용)"""
    setting = db.query(models.Setting).first()
    if not setting:
        response_data = schemas.StandardResponse(success=False, data=None, message="설정 정보가 없습니다.")
    else:
        # SQLAlchemy ORM 객체를 Pydantic 스키마로 변환해야 jsonable_encoder가 직렬화 가능
        setting_schema = schemas.SettingResponse.model_validate(setting)
        response_data = schemas.StandardResponse(success=True, data=setting_schema, message="설정을 불러왔습니다.")
    # 브라우저·CDN 캐시 방지: 영업 상태는 항상 최신값이 중요함
    return JSONResponse(
        content=jsonable_encoder(response_data),
        headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"},
    )


@router.get("/announcements/current", response_model=schemas.StandardResponse[schemas.CurrentAnnouncementsResponse])
def get_current_announcements(db: Session = Depends(get_db)):
    """
    [신규] 공개 현재 공지/이벤트 통합 조회 API
    - free_event: 현재 유효한 무료 이벤트 1개 (없으면 null)
    - notices: 현재 유효한 일반 공지 목록 (여러 개 가능)
    SCHEDULED(미래 예약) 및 ENDED(종료) 항목은 제외한다.
    """
    from services.announcement_service import get_current_public_announcements, get_announcement_status
    free_event, notices = get_current_public_announcements(db)

    def to_dict(ann: models.Announcement) -> dict:
        return {
            "id": ann.id,
            "title": ann.title,
            "content": ann.content,
            "banner_text": ann.banner_text,
            "image_url": ann.image_url,
            "is_event_mode": ann.is_event_mode,
            "sponsor_name": ann.sponsor_name,
            "sponsor_duty": ann.sponsor_duty,
            "event_type": ann.event_type,
            "is_active": ann.is_active,
            "starts_at": ann.starts_at.isoformat() if ann.starts_at else None,
            "ends_at": ann.ends_at.isoformat() if ann.ends_at else None,
            "created_at": ann.created_at.isoformat() if ann.created_at else None,
        }

    return schemas.StandardResponse(
        success=True,
        data={
            "free_event": to_dict(free_event) if free_event else None,
            "notices": [to_dict(n) for n in notices],
        },
        message="현재 공지 및 이벤트를 조회했습니다."
    )


@router.get("/announcements/active", response_model=schemas.StandardResponse)
def get_active_announcement(db: Session = Depends(get_db)):
    """
    [하위 호환] 현재 활성화된 이벤트/공지 조회
    단일 활성 항목만 반환하는 구버전 엔드포인트. 하위 호환을 위해 유지.
    시간 조건(starts_at/ends_at)도 적용하여 정확성 개선.
    """
    from services.announcement_service import get_effective_free_event, get_effective_notices
    # 무료 이벤트 우선, 없으면 일반 공지 중 첫 번째 반환
    announcement = get_effective_free_event(db)
    if not announcement:
        notices = get_effective_notices(db)
        announcement = notices[0] if notices else None

    if not announcement:
        return schemas.StandardResponse(success=True, data=None, message="현재 활성 이벤트가 없습니다.")
    return schemas.StandardResponse(success=True, data={
        "id": announcement.id,
        "title": announcement.title,
        "content": announcement.content,
        "banner_text": announcement.banner_text,
        "image_url": announcement.image_url,
        "is_event_mode": announcement.is_event_mode,
        "sponsor_name": announcement.sponsor_name,
        "sponsor_duty": announcement.sponsor_duty,
        "event_type": announcement.event_type,
        "is_active": announcement.is_active,
        "starts_at": announcement.starts_at.isoformat() if announcement.starts_at else None,
        "ends_at": announcement.ends_at.isoformat() if announcement.ends_at else None,
        "created_at": announcement.created_at.isoformat() if announcement.created_at else None,
    }, message="활성 이벤트를 조회했습니다.")


@router.get("/announcements/{announcement_id}/public", response_model=schemas.StandardResponse)
def get_public_announcement_detail(announcement_id: int, db: Session = Depends(get_db)):
    """
    [공개 API] 특정 공지/이벤트 요약 정보 조회
    주문 상태(OrderStatus) 화면에서 주문에 연결된 이벤트 정보를 표시하기 위해 사용.
    종료된 이벤트라도 해당 주문과 연결된 후원자/이벤트 감사 정보를 유지하기 위해 필요.
    """
    announcement = db.query(models.Announcement).filter(models.Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="해당 이벤트를 찾을 수 없습니다.")

    return schemas.StandardResponse(
        success=True,
        data={
            "id": announcement.id,
            "title": announcement.title,
            "sponsor_name": announcement.sponsor_name,
            "sponsor_duty": announcement.sponsor_duty,
            "event_type": announcement.event_type,
            "is_event_mode": announcement.is_event_mode,
        },
        message="이벤트 상세 정보를 조회했습니다."
    )


