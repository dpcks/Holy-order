"""
[File Role] 서버 권위 주문 가격·옵션 재계산 및 유효성 검증 서비스

아키텍처 위치: backend/services/order_pricing_service.py

설계 원칙:
  - 클라이언트가 보낸 options_text, sub_total, tumbler_discount, total_price는 가격 권위값으로 신뢰하지 않음.
  - 클라이언트는 menu_id, quantity, option_ids, 그리고 예상 결제 금액(total_price)만 전달함.
  - 서버가 DB 메뉴·옵션 DB 데이터, 텀블러 할인 정책, 유효 무료 이벤트를 기반으로 모든 금액을 재계산함.
  - 공개 주문 및 관리자 현장 주문 모두 이 서비스의 calculate_order_quote 함수를 단일 유틸리티로 호출함.
  - 메뉴나 옵션 가격이 장바구니 담은 후 변경되었거나, pricing_version != 2 이면 409 에러 반환.
"""

from dataclasses import dataclass
from typing import Sequence, List, Dict, Tuple, Any, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload
import models

# -------------------------------------------------------------
# 서버 정책 상수 (Single Source of Truth)
# -------------------------------------------------------------
PRICING_VERSION = 2
TUMBLER_DISCOUNT_PER_UNIT = 500

TEMP_OPTION_NAMES = frozenset({"ICE", "HOT"})
CUP_OPTION_NAMES = frozenset({"텀블러", "일회용컵"})


@dataclass(frozen=True)
class CalculatedOrderItem:
    client_item_key: Optional[str]
    menu_id: int
    menu_name: str
    menu_image_url: Optional[str]
    quantity: int
    selected_option_ids: Tuple[int, ...]
    selected_options_snapshot: Tuple[Dict[str, Any], ...]
    options_text: Optional[str]
    menu_base_price: int
    option_extra_price_per_unit: int
    discount_per_unit: int
    discount_total: int
    normal_unit_price: int
    normal_line_total: int


@dataclass(frozen=True)
class CalculatedOrderQuote:
    pricing_version: int
    items: Tuple[CalculatedOrderItem, ...]
    normal_total: int
    discount_total: int


def _raising_bad_request(code: str, message: str):
    raise HTTPException(
        status_code=400,
        detail={"code": code, "message": message}
    )


def calculate_order_quote(
    db: Session,
    items: Sequence[Any],
    *,
    require_available: bool = True
) -> CalculatedOrderQuote:
    """
    주문 품목(item_create) 목록을 받아 DB의 메뉴 및 옵션 가격, 텀블러 할인 정책을 적용하여
    서버 권위 가격 견적(CalculatedOrderQuote)을 계산한다.
    
    N+1 쿼리를 방지하기 위해 요청된 모든 menu_id와 options를 배치로 한 번에 조회한다.
    """
    if not items:
        _raising_bad_request("EMPTY_ORDER", "주문할 항목이 없습니다.")

    # 1. 모든 menu_id 수집 및 한 번에 쿼리 (options relation 미리 로딩)
    requested_menu_ids = list({item.menu_id for item in items})
    db_menus = (
        db.query(models.Menu)
        .options(joinedload(models.Menu.options))
        .filter(models.Menu.id.in_(requested_menu_ids), models.Menu.is_active == True)
        .all()
    )
    menu_map: Dict[int, models.Menu] = {m.id: m for m in db_menus}

    calculated_items: List[CalculatedOrderItem] = []
    normal_total = 0
    discount_total_sum = 0

    for item in items:
        menu_id = item.menu_id
        quantity = item.quantity
        if quantity <= 0:
            _raising_bad_request("INVALID_QUANTITY", "수량은 1개 이상이어야 합니다.")

        menu = menu_map.get(menu_id)
        if not menu:
            _raising_bad_request("MENU_NOT_FOUND", f"메뉴(ID: {menu_id})를 찾을 수 없습니다.")

        if require_available and not menu.is_available:
            _raising_bad_request("MENU_NOT_AVAILABLE", f"'{menu.name}' 메뉴는 현재 품절입니다.")

        # 해당 메뉴의 DB 옵션 매핑
        all_menu_options: List[models.MenuOption] = [
            opt for opt in menu.options if getattr(opt, "is_active", True)
        ]
        menu_option_map: Dict[int, models.MenuOption] = {opt.id: opt for opt in all_menu_options}

        raw_option_ids = getattr(item, "option_ids", None) or []
        
        # 중복 옵션 검증
        if len(raw_option_ids) != len(set(raw_option_ids)):
            _raising_bad_request("DUPLICATE_OPTION", f"'{menu.name}' 메뉴에 동일한 옵션이 중복 포함되었습니다.")

        # 선택한 옵션 DB 객체 조회 및 검증
        selected_options: List[models.MenuOption] = []
        for opt_id in raw_option_ids:
            opt = menu_option_map.get(opt_id)
            if not opt:
                # 다른 메뉴의 옵션이거나 존재하지 않는 옵션
                # DB 전체에서 존재하는지 탐색하여 명확한 오류 코드 반환
                db_opt = db.query(models.MenuOption).filter(models.MenuOption.id == opt_id).first()
                if not db_opt:
                    _raising_bad_request("OPTION_NOT_FOUND", f"존재하지 않는 옵션(ID: {opt_id})입니다.")
                elif getattr(db_opt, "menu_id", None) != menu_id:
                    _raising_bad_request("OPTION_MENU_MISMATCH", f"'{db_opt.name}' 옵션은 '{menu.name}' 메뉴의 옵션이 아닙니다.")
                elif not getattr(db_opt, "is_active", True):
                    _raising_bad_request("OPTION_NOT_AVAILABLE", f"'{db_opt.name}' 옵션은 현재 비활성화되었습니다.")
                else:
                    _raising_bad_request("OPTION_MENU_MISMATCH", f"'{db_opt.name}' 옵션을 메뉴에 적용할 수 없습니다.")
            selected_options.append(opt)

        # 필수 옵션 그룹 검증 (온도: ICE/HOT, 컵: 텀블러/일회용컵)
        menu_temp_options = [o for o in all_menu_options if o.name.strip().upper() in TEMP_OPTION_NAMES]
        menu_cup_options = [o for o in all_menu_options if o.name.strip() in CUP_OPTION_NAMES]

        selected_temp = [o for o in selected_options if o.name.strip().upper() in TEMP_OPTION_NAMES]
        selected_cup = [o for o in selected_options if o.name.strip() in CUP_OPTION_NAMES]

        if menu_temp_options:
            if len(selected_temp) == 0:
                _raising_bad_request("TEMPERATURE_OPTION_REQUIRED", f"'{menu.name}' 메뉴의 온도 옵션(ICE/HOT)을 선택해 주세요.")
            elif len(selected_temp) > 1:
                _raising_bad_request("TEMPERATURE_OPTION_CONFLICT", f"'{menu.name}' 메뉴에 온도 옵션을 이중 선택할 수 없습니다.")

        if menu_cup_options:
            if len(selected_cup) == 0:
                _raising_bad_request("CUP_OPTION_REQUIRED", f"'{menu.name}' 메뉴의 컵 옵션(텀블러/일회용컵)을 선택해 주세요.")
            elif len(selected_cup) > 1:
                _raising_bad_request("CUP_OPTION_CONFLICT", f"'{menu.name}' 메뉴에 컵 옵션을 이중 선택할 수 없습니다.")

        # 정렬된 options_text 생성 (온도 -> 컵 -> 나머지 추가 옵션 ID 순)
        other_options = [o for o in selected_options if o not in selected_temp and o not in selected_cup]
        other_options.sort(key=lambda x: x.id)

        ordered_selected_options: List[models.MenuOption] = selected_temp + selected_cup + other_options
        options_text_parts = [o.name.strip() for o in ordered_selected_options]
        options_text = " / ".join(options_text_parts) if options_text_parts else None

        # 금액 계산
        menu_base_price = menu.price
        option_extra_price_per_unit = sum(o.extra_price for o in selected_options)

        # 텀블러 할인 판정
        is_tumbler = any(o.name.strip() == "텀블러" for o in selected_cup)
        discount_per_unit = TUMBLER_DISCOUNT_PER_UNIT if is_tumbler else 0
        discount_total = discount_per_unit * quantity

        normal_unit_price = max(0, menu_base_price + option_extra_price_per_unit - discount_per_unit)
        normal_line_total = normal_unit_price * quantity

        normal_total += normal_line_total
        discount_total_sum += discount_total

        # selected_options_snapshot 구조 생성
        options_snapshot = tuple(
            {
                "id": o.id,
                "name": o.name.strip(),
                "extra_price": o.extra_price
            }
            for o in ordered_selected_options
        )

        client_item_key = getattr(item, "client_item_key", None)
        selected_option_ids = tuple(o.id for o in ordered_selected_options)

        calculated_items.append(
            CalculatedOrderItem(
                client_item_key=client_item_key,
                menu_id=menu_id,
                menu_name=menu.name,
                menu_image_url=menu.image_url,
                quantity=quantity,
                selected_option_ids=selected_option_ids,
                selected_options_snapshot=options_snapshot,
                options_text=options_text,
                menu_base_price=menu_base_price,
                option_extra_price_per_unit=option_extra_price_per_unit,
                discount_per_unit=discount_per_unit,
                discount_total=discount_total,
                normal_unit_price=normal_unit_price,
                normal_line_total=normal_line_total,
            )
        )

    return CalculatedOrderQuote(
        pricing_version=PRICING_VERSION,
        items=tuple(calculated_items),
        normal_total=normal_total,
        discount_total=discount_total_sum,
    )
