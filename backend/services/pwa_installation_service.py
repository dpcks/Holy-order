"""
[File Role] PWA 익명 설치 기기 추적 및 통계 관리를 처리하는 비즈니스 로직 서비스
- heartbeat 수신 시 upsert (중복 행 방지)
- 백엔드 throttling (5분 미만 빈번한 write 생략)
- 설치 증거(standalone 실행, appinstalled 이벤트 등)가 있는 레코드만 집계
- 최근 7일/30일/90일 활성 (last_standalone_at 기준) 및 플랫폼별 통계 집계
- 마스킹된 설치 목록 제공
"""

from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from datetime import datetime, timedelta, timezone
import models
import schemas

from typing import Optional

def get_utc_now():
    return datetime.now(timezone.utc)

def installation_evidence_filter():
    """설치 증거가 있는 레코드 단일 판정 필터"""
    return or_(
        models.PwaInstallation.first_standalone_at.isnot(None),
        models.PwaInstallation.last_standalone_at.isnot(None),
        models.PwaInstallation.related_app_installed.is_(True),
        models.PwaInstallation.last_detection_method.in_(["APPINSTALLED_EVENT", "RELATED_APPS"])
    )

def has_installation_evidence(
    *,
    is_running_standalone: bool,
    detection_method: str,
    related_app_installed: Optional[bool] = None
) -> bool:
    """단일 수신 heartbeat 설치 증거 검증"""
    return (
        is_running_standalone
        or related_app_installed is True
        or detection_method in {"APPINSTALLED_EVENT", "RELATED_APPS"}
    )

def upsert_heartbeat(
    db: Session,
    installation_id: str,
    app_type: str,
    platform: str,
    browser_family: str,
    is_running_standalone: bool,
    detection_method: str,
    push_permission: str,
    related_app_installed: bool = None,
    admin_id: int = None
) -> dict:
    now = get_utc_now()

    # 서버 측 설치 증거 검증 (일반 QR 웹 및 일반 브라우저 접속 필터링)
    if not has_installation_evidence(
        is_running_standalone=is_running_standalone,
        detection_method=detection_method,
        related_app_installed=related_app_installed
    ):
        return {
            "status": "ignored",
            "reason": "no_installation_evidence",
            "app_type": app_type,
            "admin_id": admin_id
        }

    # installation_id & app_type 복합 유일키 조회
    record = db.query(models.PwaInstallation).filter(
        models.PwaInstallation.installation_id == installation_id,
        models.PwaInstallation.app_type == app_type
    ).first()

    if not record:
        record = models.PwaInstallation(
            installation_id=installation_id,
            app_type=app_type,
            platform=platform or "UNKNOWN",
            browser_family=browser_family or "UNKNOWN",
            first_seen_at=now,
            last_seen_at=now,
            first_standalone_at=now if is_running_standalone else None,
            last_standalone_at=now if is_running_standalone else None,
            last_detection_method=detection_method or "UNKNOWN",
            push_permission=push_permission or "UNKNOWN",
            related_app_installed=related_app_installed,
            admin_id=admin_id if app_type == "ADMIN" else None
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return {
            "status": "created",
            "app_type": record.app_type,
            "admin_id": record.admin_id
        }

    # 백엔드 throttling: 마지막 갱신 5분 미만이고 주요 상태 변경이 없으면 DB write 생략
    five_minutes_ago = now - timedelta(minutes=5)
    last_seen = record.last_seen_at
    if last_seen and last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    should_update_time = last_seen is None or last_seen < five_minutes_ago
    state_changed = (
        (is_running_standalone and record.last_standalone_at is None) or
        record.push_permission != push_permission or
        record.platform != platform or
        record.browser_family != browser_family or
        record.last_detection_method != detection_method or
        (app_type == "ADMIN" and admin_id is not None and record.admin_id != admin_id)
    )

    if should_update_time or state_changed:
        record.last_seen_at = now
        record.platform = platform or record.platform
        record.browser_family = browser_family or record.browser_family
        record.last_detection_method = detection_method or record.last_detection_method
        record.push_permission = push_permission or record.push_permission
        if related_app_installed is not None:
            record.related_app_installed = related_app_installed

        if is_running_standalone:
            if record.first_standalone_at is None:
                record.first_standalone_at = now
            record.last_standalone_at = now

        if app_type == "ADMIN" and admin_id is not None:
            record.admin_id = admin_id

        db.commit()
        db.refresh(record)
        return {
            "status": "updated",
            "app_type": record.app_type,
            "admin_id": record.admin_id
        }

    return {
        "status": "unchanged",
        "app_type": record.app_type,
        "admin_id": record.admin_id
    }


def get_user_installation_by_key(db: Session, installation_id: str) -> models.PwaInstallation:
    """주문과 연결할 유효한 USER installation 조회 (증거 필터 적용, 실패 시 None)"""
    if not installation_id:
        return None
    try:
        return db.query(models.PwaInstallation).filter(
            models.PwaInstallation.installation_id == installation_id,
            models.PwaInstallation.app_type == "USER",
            installation_evidence_filter()
        ).first()
    except Exception:
        return None


def get_pwa_stats(db: Session, active_days: int = 30) -> dict:
    now = get_utc_now()
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)
    ninety_days_ago = now - timedelta(days=90)
    custom_days_ago = now - timedelta(days=active_days)

    evidence = installation_evidence_filter()

    # 1. 누적 설치 감지 인스턴스 (증거 필터 적용)
    detected_total = db.query(models.PwaInstallation).filter(evidence).count()

    # 2. 최근 7일 / 30일 활성 (last_standalone_at 기준)
    active_7d = db.query(models.PwaInstallation).filter(
        evidence,
        models.PwaInstallation.last_standalone_at >= seven_days_ago
    ).count()

    active_30d = db.query(models.PwaInstallation).filter(
        evidence,
        models.PwaInstallation.last_standalone_at >= thirty_days_ago
    ).count()

    active_custom = db.query(models.PwaInstallation).filter(
        evidence,
        models.PwaInstallation.last_standalone_at >= custom_days_ago
    ).count()

    # 3. 90일 이상 미사용 (stale)
    stale_90d = db.query(models.PwaInstallation).filter(
        evidence,
        or_(
            models.PwaInstallation.last_standalone_at < ninety_days_ago,
            and_(
                models.PwaInstallation.last_standalone_at.is_(None),
                models.PwaInstallation.last_seen_at < ninety_days_ago
            )
        )
    ).count()

    # 4. app_type 별 분포
    user_count = db.query(models.PwaInstallation).filter(
        evidence,
        models.PwaInstallation.app_type == "USER"
    ).count()
    admin_count = db.query(models.PwaInstallation).filter(
        evidence,
        models.PwaInstallation.app_type == "ADMIN"
    ).count()

    # 5. platform 별 분포
    ios_count = db.query(models.PwaInstallation).filter(
        evidence,
        models.PwaInstallation.platform == "IOS"
    ).count()
    android_count = db.query(models.PwaInstallation).filter(
        evidence,
        models.PwaInstallation.platform == "ANDROID"
    ).count()
    desktop_count = db.query(models.PwaInstallation).filter(
        evidence,
        models.PwaInstallation.platform == "DESKTOP"
    ).count()
    unknown_count = db.query(models.PwaInstallation).filter(
        evidence,
        or_(models.PwaInstallation.platform == "UNKNOWN", models.PwaInstallation.platform.is_(None))
    ).count()

    # 6. 최근 30일 standalone 활성 기기
    standalone_active_30d = active_30d

    # 7. 푸시 권한 허용 기기 수
    push_granted = db.query(models.PwaInstallation).filter(
        evidence,
        models.PwaInstallation.push_permission == "GRANTED"
    ).count()

    # 8. 최근 30일 PWA 주문 수 & 주문 생성 고유 PWA 기기 수
    pwa_orders_30d = db.query(models.Order).filter(
        models.Order.is_pwa == True,
        models.Order.created_at >= thirty_days_ago,
        models.Order.is_active == True
    ).count()

    unique_ordering_installations_30d = db.query(
        func.count(func.distinct(models.Order.pwa_installation_id))
    ).filter(
        models.Order.pwa_installation_id.isnot(None),
        models.Order.created_at >= thirty_days_ago,
        models.Order.is_active == True
    ).scalar() or 0

    # 9. 확인된 고유 사용자 (30일내 PWA 연결 주문 distinct user_id)
    confirmed_unique_users_30d = db.query(
        func.count(func.distinct(models.Order.user_id))
    ).filter(
        models.Order.pwa_installation_id.isnot(None),
        models.Order.user_id.isnot(None),
        models.Order.created_at >= thirty_days_ago,
        models.Order.is_active == True
    ).scalar() or 0

    # 10. 확인된 고유 관리자 (30일내 standalone 활성 ADMIN 인스턴스 distinct admin_id)
    confirmed_unique_admins_30d = db.query(
        func.count(func.distinct(models.PwaInstallation.admin_id))
    ).filter(
        evidence,
        models.PwaInstallation.app_type == "ADMIN",
        models.PwaInstallation.admin_id.isnot(None),
        models.PwaInstallation.last_standalone_at >= thirty_days_ago
    ).scalar() or 0

    return {
        "detected_total": detected_total,
        "active_7d": active_7d,
        "active_30d": active_30d,
        "stale_90d": stale_90d,
        "by_app_type": {
            "USER": user_count,
            "ADMIN": admin_count
        },
        "by_platform": {
            "IOS": ios_count,
            "ANDROID": android_count,
            "DESKTOP": desktop_count,
            "UNKNOWN": unknown_count
        },
        "standalone_active_30d": standalone_active_30d,
        "push_permission_granted": push_granted,
        "pwa_orders_30d": pwa_orders_30d,
        "unique_ordering_installations_30d": unique_ordering_installations_30d,
        "confirmed_unique_users_30d": confirmed_unique_users_30d,
        "confirmed_unique_admins_30d": confirmed_unique_admins_30d,
        "active_custom": active_custom,
        "active_days": active_days
    }


def list_pwa_installations(
    db: Session,
    page: int = 1,
    limit: int = 20,
    app_type: str = None,
    platform: str = None,
    activity: str = None
):
    now = get_utc_now()
    evidence = installation_evidence_filter()
    query = db.query(models.PwaInstallation).filter(evidence)

    if app_type:
        query = query.filter(models.PwaInstallation.app_type == app_type)
    if platform:
        query = query.filter(models.PwaInstallation.platform == platform)

    if activity == "ACTIVE_7D":
        query = query.filter(models.PwaInstallation.last_standalone_at >= now - timedelta(days=7))
    elif activity == "ACTIVE_30D":
        query = query.filter(models.PwaInstallation.last_standalone_at >= now - timedelta(days=30))
    elif activity == "STALE_90D":
        query = query.filter(
            or_(
                models.PwaInstallation.last_standalone_at < now - timedelta(days=90),
                and_(
                    models.PwaInstallation.last_standalone_at.is_(None),
                    models.PwaInstallation.last_seen_at < now - timedelta(days=90)
                )
            )
        )

    total_count = query.count()
    total_pages = max(1, (total_count + limit - 1) // limit)
    offset = (page - 1) * limit

    items = query.order_by(models.PwaInstallation.last_seen_at.desc()).offset(offset).limit(limit).all()

    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)
    ninety_days_ago = now - timedelta(days=90)

    result_items = []
    for item in items:
        masked_id = item.installation_id[:8] + "..." if item.installation_id else "UNKNOWN"
        admin_name = item.admin.name if item.admin else None

        last_st = item.last_standalone_at
        if last_st and last_st.tzinfo is None:
            last_st = last_st.replace(tzinfo=timezone.utc)
        last_seen = item.last_seen_at
        if last_seen and last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)

        is_active_7d = bool(last_st and last_st >= seven_days_ago)
        is_active_30d = bool(last_st and last_st >= thirty_days_ago)
        is_stale_90d = bool((last_st and last_st < ninety_days_ago) or (not last_st and last_seen and last_seen < ninety_days_ago))

        result_items.append({
            "id": item.id,
            "masked_installation_id": masked_id,
            "app_type": item.app_type,
            "platform": item.platform,
            "browser_family": item.browser_family,
            "first_seen_at": item.first_seen_at.isoformat() if item.first_seen_at else None,
            "last_seen_at": item.last_seen_at.isoformat() if item.last_seen_at else None,
            "first_standalone_at": item.first_standalone_at.isoformat() if item.first_standalone_at else None,
            "last_standalone_at": item.last_standalone_at.isoformat() if item.last_standalone_at else None,
            "last_detection_method": item.last_detection_method,
            "push_permission": item.push_permission,
            "admin_name": admin_name,
            "has_install_evidence": True,
            "is_active_7d": is_active_7d,
            "is_active_30d": is_active_30d,
            "is_stale_90d": is_stale_90d
        })

    return {
        "items": result_items,
        "total_count": total_count,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }
