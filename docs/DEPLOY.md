# Holy-Order 배포 전략 가이드 (Deployment Strategy)

이 문서는 Holy-Order 프로젝트의 효율적인 운영 및 배포를 위한 가이드를 제공합니다. 교회 카페 운영 특성(주일 피크 트래픽)에 최적화된 아키텍처를 지향합니다.

---

## 1. 배포 아키텍처 개요

| 구분 | 플랫폼 | 역할 | 비고 |
| :--- | :--- | :--- | :--- |
| **Backend** | **Vercel** | FastAPI (Serverless Functions) | 주일 피크 타임 자동 확장 (Auto-scaling) |
| **Frontend** | **Railway** | React (Vite) 컨테이너 | 높은 가용성 및 설정 편의성 |
| **Database** | **Railway** | PostgreSQL 15 | 백엔드와의 지연 시간(Latency) 최소화 |
| **Media** | **Cloudinary** | 이미지 (.jpg, .png) 및 오디오 (.mp3) | CDN을 통한 빠른 로딩 및 서버 부하 감소 |

---

## 2. 플랫폼별 상세 설정

### 2-1. 백엔드 (Vercel + FastAPI)
Vercel은 서버리스 환경이므로 주일 10:00~13:30 사이의 급격한 트래픽 증가에 가장 유연하게 대응할 수 있습니다.

- **설정**: `vercel.json` 파일을 통해 FastAPI 엔트리 포인트를 설정합니다.
- **장점**: 사용한 만큼만 비용을 지불하므로 평일 관리자 사용 시 비용 효율이 높습니다.
- **주의**: Cold Start(최초 접속 지연) 방지를 위해 주일 10시 직전에 관리자 페이지에 한 번 접속하여 인스턴스를 활성화해두는 것이 좋습니다.

### 2-2. 프런트엔드 (Railway + React)
사용자가 QR을 스캔했을 때 즉각적인 UI 반응을 위해 Railway를 사용합니다.

- **설정**: `nixpacks` 또는 `Dockerfile`을 통해 빌드 및 배포를 자동화합니다.
- **장점**: 배포가 매우 빠르며, GitHub 연동을 통한 CI/CD가 강력합니다.

### 2-3. 미디어 관리 (Cloudinary)
교회 Wi-Fi 환경이 불안정할 수 있으므로 무거운 미디어 파일은 전문 CDN에 맡깁니다.

- **이미지**: 메뉴 사진 등 고화질 이미지를 자동으로 압축하여 제공합니다.
- **알림음**: 제조 완료 시 울리는 `.mp3` 파일을 Cloudinary에 업로드하여 안정적인 재생을 보장합니다.

---

## 3. 운영 최적화 전략 (주일 피크 타임 대응)

Holy-Order는 일주일 중 약 4시간(주일 10:00~14:00) 동안 90% 이상의 트래픽이 발생합니다.

1.  **리소스 스케줄링**: 
    - Railway의 경우 주일 피크 타임 직전에 리소스를 일시적으로 상향 조절하고, 평일에는 최소 사양으로 낮추어 비용을 절감할 수 있습니다.
2.  **데이터베이스 인덱싱**: 
    - 주일 대량 주문 시 검색 성능을 위해 `orders` 테이블의 `status` 및 `created_at` 컬럼에 인덱스 설계를 강화합니다.
3.  **캐싱 전략**:
    - 메뉴 목록 등 변동이 적은 데이터는 프런트엔드 `LocalStorage`에 캐싱하여 서버 요청 횟수를 줄입니다.

---

## 4. 환경 변수 설정 (Secrets)

배포 플랫폼 대시보드에 아래 항목을 반드시 등록해야 합니다.

### Backend (Vercel/Railway)
- `DATABASE_URL`: PostgreSQL 접속 정보
- `SECRET_KEY`: JWT 서명용 키
- `CLOUDINARY_URL`: 미디어 서버 연동 키
- `CORS_ORIGINS`: 프런트엔드 배포 주소

### Frontend (Railway)
- `VITE_API_URL`: 백엔드 API 주소
- `VITE_WS_URL`: WebSocket 주소

---

## 5. 배포 체크리스트

- [ ] `.env` 파일이 `.gitignore`에 등록되어 유출되지 않는가?
- [ ] 데이터베이스 마이그레이션(`alembic` 등)이 완료되었는가?
- [ ] Cloudinary에 모든 미디어 파일이 업로드되었는가?
- [ ] HTTPS 프로토콜로 모든 통신이 이루어지는가? (사파리 웹소켓 이슈 방지)
