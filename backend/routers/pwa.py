"""
[File Role] PWA 설치 추적, Heartbeat 수신 및 관리자 통계 조회 API 라우터
- POST /api/v1/pwa/installations/heartbeat (공개, USER 고정)
- POST /api/v1/admin/pwa/installations/heartbeat (관리자 인증, ADMIN 고정)
- GET /api/v1/admin/pwa/installations/stats (관리자 인증, 통계)
- GET /api/v1/admin/pwa/installations (관리자 인증, 목록)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

import models
import schemas
from database import get_db
from auth import get_current_admin
from services import pwa_installation_service

router = APIRouter(tags=["pwa_installations"])


# 1. 공개 사용자 PWA Heartbeat (app_type은 서버에서 USER로 강제 고정)
@router.post("/api/v1/pwa/installations/heartbeat", response_model=schemas.StandardResponse[dict])
def user_pwa_heartbeat(
    req: schemas.PwaHeartbeatRequest,
    db: Session = Depends(get_db)
):
    try:
        record = pwa_installation_service.upsert_heartbeat(
            db=db,
            installation_id=req.installation_id,
            app_type="USER",
            platform=req.platform.value,
            browser_family=req.browser_family.value,
            is_running_standalone=req.is_running_standalone,
            detection_method=req.detection_method.value,
            push_permission=req.push_permission.value,
            related_app_installed=req.related_app_installed,
            admin_id=None
        )
        return schemas.StandardResponse(
            success=True,
            message="사용자 PWA 설치 상태가 성공적으로 기록되었습니다.",
            data={"status": "ok", "app_type": record.app_type}
        )
    except Exception as e:
        # PWA heartbeat 실패가 사용자 경험에 지장을 주지 않도록 안전 반환
        return schemas.StandardResponse(
            success=False,
            message=f"PWA 기록 처리 중 오류: {str(e)}",
            data=None
        )


# 2. 관리자 PWA Heartbeat (관리자 인증 필수, app_type은 ADMIN으로 강제 고정)
@router.post("/api/v1/admin/pwa/installations/heartbeat", response_model=schemas.StandardResponse[dict])
def admin_pwa_heartbeat(
    req: schemas.PwaHeartbeatRequest,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    try:
        record = pwa_installation_service.upsert_heartbeat(
            db=db,
            installation_id=req.installation_id,
            app_type="ADMIN",
            platform=req.platform.value,
            browser_family=req.browser_family.value,
            is_running_standalone=req.is_running_standalone,
            detection_method=req.detection_method.value,
            push_permission=req.push_permission.value,
            related_app_installed=req.related_app_installed,
            admin_id=current_admin.id
        )
        return schemas.StandardResponse(
            success=True,
            message="관리자 PWA 설치 상태가 성공적으로 기록되었습니다.",
            data={"status": "ok", "app_type": record.app_type, "admin_id": current_admin.id}
        )
    except Exception as e:
        return schemas.StandardResponse(
            success=False,
            message=f"관리자 PWA 기록 처리 중 오류: {str(e)}",
            data=None
        )


# 3. 관리자 PWA 설치 및 기기 통계 조회 (관리자 인증 필수)
@router.get("/api/v1/admin/pwa/installations/stats", response_model=schemas.StandardResponse[schemas.PwaStatsResponse])
def get_pwa_stats_api(
    active_days: int = Query(30, ge=1, le=365),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    stats = pwa_installation_service.get_pwa_stats(db=db, active_days=active_days)
    return schemas.StandardResponse(
        success=True,
        message="PWA 설치 기기 통계가 성공적으로 조회되었습니다.",
        data=schemas.PwaStatsResponse(**stats)
    )


# 4. 관리자 PWA 설치 기기 목록 조회 (관리자 인증 필수, 마스킹 제공)
@router.get("/api/v1/admin/pwa/installations", response_model=schemas.StandardResponse[schemas.PwaInstallationListResponse])
def list_pwa_installations_api(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    app_type: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    activity: Optional[str] = Query(None),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    result = pwa_installation_service.list_pwa_installations(
        db=db,
        page=page,
        limit=limit,
        app_type=app_type,
        platform=platform,
        activity=activity
    )
    return schemas.StandardResponse(
        success=True,
        message="PWA 설치 기기 목록이 성공적으로 조회되었습니다.",
        data=schemas.PwaInstallationListResponse(**result)
    )
