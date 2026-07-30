"""
[File Role] 이벤트/공지 공용 서비스 계층 — 22. 이벤트 유효성·무료 주문 판정 안전화

아키텍처 위치: backend/services/announcement_service.py
공개 조회, 공개 주문, 관리자 수동 주문이 모두 이 모듈의 함수를 사용해야 함.

설계 원칙:
  - 이벤트 유효성 판단은 이 파일 한 곳에서만 수행 (Single Source of Truth)
  - DB의 starts_at/ends_at은 naive datetime → get_seoul_time().replace(tzinfo=None)과 비교
  - 무료 이벤트 여부는 클라이언트 요청값(FREE, 0원)이 아닌 서버 DB 조회 결과만으로 결정
"""
from datetime import datetime
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_
import models


def _now_naive() -> datetime:
    """DB의 naive datetime과 비교 가능한 서울 현지 시각(naive)를 반환한다."""
    return models.get_seoul_time().replace(tzinfo=None)


def get_announcement_status(announcement: models.Announcement, now: Optional[datetime] = None) -> str:
    """
    Announcement 객체를 받아 파생 게시 상태를 반환한다.
    DRAFT / SCHEDULED / LIVE / ENDED
    """
    if now is None:
        now = _now_naive()

    # ENDED: ends_at이 존재하고 이미 지난 경우 (is_active 무관)
    if announcement.ends_at and announcement.ends_at <= now:
        return "ENDED"

    if not announcement.is_active:
        return "DRAFT"

    # SCHEDULED: starts_at이 미래
    if announcement.starts_at and announcement.starts_at > now:
        return "SCHEDULED"

    # LIVE
    return "LIVE"


def get_content_type(announcement: models.Announcement) -> str:
    return "FREE_EVENT" if announcement.is_event_mode else "NOTICE"


def get_effective_free_event(db: Session, now: Optional[datetime] = None) -> Optional[models.Announcement]:
    """
    현재 유효한 무료 이벤트를 반환한다.
    이 함수가 None이면 무료 이벤트 없음 — 클라이언트 값으로 우회 불가.
    """
    if now is None:
        now = _now_naive()
    return db.query(models.Announcement).filter(
        models.Announcement.is_event_mode == True,
        models.Announcement.is_active == True,
        or_(models.Announcement.starts_at == None, models.Announcement.starts_at <= now),
        or_(models.Announcement.ends_at == None, models.Announcement.ends_at > now),
    ).first()


def get_effective_notices(db: Session, now: Optional[datetime] = None) -> List[models.Announcement]:
    """현재 유효한 일반 공지 목록 반환 (여러 개 동시 가능)"""
    if now is None:
        now = _now_naive()
    return db.query(models.Announcement).filter(
        models.Announcement.is_event_mode == False,
        models.Announcement.is_active == True,
        or_(models.Announcement.starts_at == None, models.Announcement.starts_at <= now),
        or_(models.Announcement.ends_at == None, models.Announcement.ends_at > now),
    ).order_by(models.Announcement.created_at.desc()).all()


def get_current_public_announcements(db: Session, now: Optional[datetime] = None) -> Tuple[Optional[models.Announcement], List[models.Announcement]]:
    """공개 /announcements/current API 전용 통합 조회."""
    if now is None:
        now = _now_naive()
    return get_effective_free_event(db, now), get_effective_notices(db, now)


def validate_announcement_period(starts_at: Optional[datetime], ends_at: Optional[datetime]) -> None:
    """starts_at < ends_at 검증. 위반 시 ValueError."""
    if starts_at and ends_at and starts_at >= ends_at:
        raise ValueError("종료 시각은 시작 시각보다 늦어야 합니다.")


def validate_free_event_overlap(db: Session, starts_at: Optional[datetime], ends_at: Optional[datetime], exclude_id: Optional[int] = None) -> None:
    """
    게시된(is_active=True) 무료 이벤트 중 시간 범위가 겹치는 항목 검사.
    인접 시각(A 종료 = B 시작)은 허용. 겹치면 ValueError.
    """
    query = db.query(models.Announcement).filter(
        models.Announcement.is_event_mode == True,
        models.Announcement.is_active == True,
    )
    if exclude_id is not None:
        query = query.filter(models.Announcement.id != exclude_id)

    for ev in query.all():
        ev_start = ev.starts_at
        ev_end = ev.ends_at
        # 겹침: ev_start < new_end AND new_start < ev_end (None = 무한)
        start_before_end = (ev_start is None) or (ends_at is None) or (ev_start < ends_at)
        new_start_before_ev_end = (starts_at is None) or (ev_end is None) or (starts_at < ev_end)
        if start_before_end and new_start_before_ev_end:
            raise ValueError(
                f"같은 시간에 게시되는 무료 이벤트가 이미 있습니다. "
                f"(충돌: '{ev.title}', "
                f"{ev_start.strftime('%m/%d %H:%M') if ev_start else '시작 미지정'} ~ "
                f"{ev_end.strftime('%m/%d %H:%M') if ev_end else '종료 미지정'})"
            )
