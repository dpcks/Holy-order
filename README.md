# Holy-Order

교회 카페 운영을 위한 QR 기반 비대면 주문 및 결제 관리 시스템

## 🏗️ 시스템 아키텍처

* **Frontend**: React (Vite, TypeScript), Tailwind CSS
* **Backend**: FastAPI (Python), SQLAlchemy, Pydantic
* **Database**: PostgreSQL 15

## 🚀 로컬 개발 환경 설정

### 1. Database (PostgreSQL)
Docker가 설치되어 있어야 합니다.
```bash
docker-compose up -d
```

### 2. Backend (FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

### 3. Frontend (React/Vite)
```bash
cd frontend
npm install
npm run dev
```
