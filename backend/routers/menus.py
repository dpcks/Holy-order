from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

import models, schemas
from database import get_db

router = APIRouter(prefix="/api/v1/categories", tags=["menus"])

@router.get("/", response_model=schemas.StandardResponse[List[schemas.CategoryWithMenusResponse]])
def get_categories_with_menus(db: Session = Depends(get_db)):
    categories = db.query(models.Category).filter(models.Category.is_active == True).order_by(models.Category.display_order).all()
    return schemas.StandardResponse(success=True, data=categories, message="메뉴 목록을 가져왔습니다.")
