from fastapi import APIRouter, Depends, HTTPException
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

    # 각 카테고리의 비활성 메뉴 제외
    for category in categories:
        category.menus = [
            menu for menu in category.menus
            if menu.is_active  # is_active만 필터링
            # is_available은 품절 표시를 위해 유지
        ]

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
        return schemas.StandardResponse(success=False, data=None, message="설정 정보가 없습니다.")
    return schemas.StandardResponse(success=True, data=setting, message="설정을 불러왔습니다.")

