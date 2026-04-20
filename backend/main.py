from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import models
from database import engine
from config import settings
from routers import menus, users, orders, admin

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Holy-Order API", description="교회 카페 주문 시스템 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(menus.router)
app.include_router(users.router)
app.include_router(orders.router)
app.include_router(admin.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Holy-Order API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
