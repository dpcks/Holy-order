from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import models
from database import engine, get_db
from config import settings

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Holy-Order API", description="교회 카페 주문 시스템 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to Holy-Order API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
