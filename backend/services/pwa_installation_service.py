"""
[File Role] PWA 익명 설치 기기 추적 및 통계 관리를 처리하는 비즈니스 로직 서비스
- heartbeat 수신 시 upsert (중복 행 방지)
- 백엔드 throttling (5분 미만 빈번한 write 생략)
- 최근 7일/30일/90일 활성 및 플랫폼별 통계 집계
- 마스킹된 설치 목록 제공
"""

from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from datetime import datetime, timedelta, timezone
import models
import schemas

KST = timezone(timedelta(hours=9))

def get_seoul_now():
    return datetime.now(KST).replace(tzinfo=None)

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
) -> models.PwaInstallation:
    now = get_seoul_now()
    
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
        return record
    
    # 백엔드 throttling: 마지막 갱신 5분 미만이고 스탠드얼론/푸시권한 변경이 없으면 무거운 DB write 생략
    five_minutes_ago = now - timedelta(minutes=5)
    should_update_time = record.last_seen_at is None or record.last_seen_at < five_minutes_ago
    state_changed = (
        (is_running_standalone and record.last_standalone_at is None) or
        record.push_permission != push_permission or
        record.platform != platform or
        record.browser_family != browser_family or
        record.last_detection_method != detection_method
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
        
    return record


def get_user_installation_by_key(db: Session, installation_id: str) -> models.PwaInstallation:
    """주문과 연결할 유효한 USER installation 조회 (실패 시 None)"""
    if not installation_id:
        return None
    try:
        return db.query(models.PwaInstallation).filter(
            models.PwaInstallation.installation_id == installation_id,
            models.PwaInstallation.app_type == "USER"
        ).first()
    except Exception:
        return None


def get_pwa_stats(db: Session, active_days: int = 30) -> dict:
    now = get_seoul_now()
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)
    ninety_days_ago = now - timedelta(days=90)

    # 1. 누적 감지 수
    detected_total = db.query(models.PwaInstallation).count()

    # 2. 최근 7일 / 30일 활성
    active_7d = db.query(models.PwaInstallation).filter(
        models.PwaInstallation.last_seen_at >= seven_days_ago
    ).count()

    active_30d = db.query(models.PwaInstallation).filter(
        models.PwaInstallation.last_seen_at >= thirty_days_ago
    ).count()

    # 3. 90일 이상 미사용 (stale)
    stale_90d = db.query(models.PwaInstallation).filter(
        models.PwaInstallation.last_seen_at < ninety_days_ago
    ).count()

    # 4. app_type 별 분포
    user_count = db.query(models.PwaInstallation).filter(models.PwaInstallation.app_type == "USER").count()
    admin_count = db.query(models.PwaInstallation).filter(models.PwaInstallation.app_type == "ADMIN").count()

    # 5. platform 별 분포
    ios_count = db.query(models.PwaInstallation).filter(models.PwaInstallation.platform == "IOS").count()
    android_count = db.query(models.PwaInstallation).filter(models.PwaInstallation.platform == "ANDROID").count()
    desktop_count = db.query(models.PwaInstallation).filter(models.PwaInstallation.platform == "DESKTOP").count()
    unknown_count = db.query(models.PwaInstallation).filter(
        or_(models.PwaInstallation.platform == "UNKNOWN", models.PwaInstallation.platform == None)
    ).count()

    # 6. 최근 30일 standalone 활성 기기
    standalone_active_30d = db.query(models.PwaInstallation).filter(
        models.PwaInstallation.last_standalone_at >= thirty_days_ago
    ).count()

    # 7. 푸시 권한 허용 기기 수
    push_granted = db.query(models.PwaInstallation).filter(
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
        "unique_ordering_installations_30d": unique_ordering_installations_30d
    }


def list_pwa_installations(
    db: Session,
    page: int = 1,
    limit: int = 20,
    app_type: str = None,
    platform: str = None,
    activity: str = None
):
    query = db.query(models.PwaInstallation)

    if app_type:
        query = query.filter(models.PwaInstallation.app_type == app_type)
    if platform:
        query = query.filter(models.PwaInstallation.platform == platform)

    now = get_seoul_now()
    if activity == "ACTIVE_7D":
        query = query.filter(models.PwaInstallation.last_seen_at >= now - timedelta(days=7))
    elif activity == "ACTIVE_30D":
        query = query.filter(models.PwaInstallation.last_seen_at >= now - timedelta(days=30))
    elif activity == "STALE_90D":
        query = query.filter(models.PwaInstallation.last_seen_at < now - timedelta(days=90))

    total_count = query.count()
    total_pages = max(1, (total_count + limit - 1) // limit)
    offset = (page - 1) * limit

    items = query.order_by(models.PwaInstallation.last_seen_at.desc()).offset(offset).limit(limit).all()

    result_items = []
    for item in items:
        # installation_id 마스킹 (보안 정책: 앞 8자리만 노출)
        masked_id = item.installation_id[:8] + "..." if item.installation_id else "UNKNOWN"
        admin_name = item.admin.name if item.admin else None
        
        result_items.append({
            "masked_installation_id": masked_id,
            "app_type": item.app_type,
            "platform": item.platform,
            "browser_family": item.browser_family,
            "first_seen_at": item.first_seen_at.isoformat() if item.first_seen_at else None,
            "last_seen_at": item.last_seen_at.isoformat() if item.last_seen_at else None,
            "last_standalone_at": item.last_standalone_at.isoformat() if item.last_standalone_at else None,
            "last_detection_method": item.last_detection_method,
            "push_permission": item.push_permission,
            "admin_name": admin_name
        })

    return {
        "items": result_items,
        "total_count": total_count,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }
