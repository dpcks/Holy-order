from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

import models, schemas
from database import get_db

router = APIRouter(prefix="/api/v1/users", tags=["users"])

@router.post("/", response_model=schemas.StandardResponse[schemas.UserResponse])
def create_or_get_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.phone == user.phone).first()
    if db_user:
        # 소프트 삭제된 유저 복구
        if not db_user.is_active:
            db_user.is_active = True
            db_user.deleted_at = None
        # 직분이나 이름이 바뀌었으면 업데이트
        if db_user.name != user.name or db_user.duty != user.duty:
            db_user.name = user.name
            db_user.duty = user.duty
        db.commit()
        db.refresh(db_user)
        return schemas.StandardResponse(success=True, data=db_user, message="사용자 정보를 가져왔습니다.")
    
    new_user = models.User(name=user.name, phone=user.phone, duty=user.duty)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return schemas.StandardResponse(success=True, data=new_user, message="새 사용자가 등록되었습니다.")
