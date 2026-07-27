/**
 * [File Role] 관리자 페이지의 업데이트 소식(릴리즈 노트) 데이터를 관리하는 파일
 * - 새로운 기능 배포 시 이 파일에 내역을 추가하면 관리자 설정 화면에 자동으로 반영됩니다.
 */

export interface ReleaseUpdate {
  text: string;
  isNew?: boolean;
}

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  updates: ReleaseUpdate[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: 'v1.6.4',
    date: new Date().toISOString().split('T')[0],
    title: '주문 내역 및 입금 내역 페이지 PWA 하단 여백 최적화',
    updates: [
      { text: '주문 내역 및 입금 내역 페이지 푸터 하단 여백(safe-area)을 확충하여 20개씩 보기 버튼 가시성 높임', isNew: true }
    ]
  },
  {
    version: 'v1.6.3',
    date: new Date().toISOString().split('T')[0],
    title: '정산 및 매출 통계 화면 PWA 분석 전용 탭 분리 구현',
    updates: [
      { text: '매출 및 정산 리포트 탭과 PWA 설치/활성 기기 분석 탭으로 UI 전환 분리', isNew: true },
      { text: '등록된 PWA 익명 설치 기기 목록 테이블 조회 기능 추가', isNew: true }
    ]
  },
  {
    version: 'v1.6.2',
    date: new Date().toISOString().split('T')[0],
    title: '배포 시 서버 스타트업 자동 스키마 마이그레이션(Auto-Migration) 지원',
    updates: [
      { text: '백엔드 재배포 시 DB 컬럼(pwa_installation_id 등) 자동 생성을 위한 startup 마이그레이션 로직 탑재', isNew: true },
      { text: 'PWA mobile-web-app-capable 메타 태그 추가로 크롬 권장 표준 준수', isNew: true }
    ]
  },
  {
    version: 'v1.6.1',
    date: new Date().toISOString().split('T')[0],
    title: '로컬 LAN IP(192.168.x.x) 네트워크 CORS 허용 옵션 강화',
    updates: [
      { text: '백엔드 CORSMiddleware 정규식을 강화하여 로컬 IP 주소 접속 시 CORS 정책 차단 문제 해결', isNew: true }
    ]
  },
  {
    version: 'v1.6.0',
    date: new Date().toISOString().split('T')[0],
    title: 'PWA 익명 설치 감지 및 활성 기기 분석 통계 구축',
    updates: [
      { text: '익명 installation_id 기반 PwaInstallation 모델 및 Throttled Heartbeat 추적 시스템 도입', isNew: true },
      { text: '사용자 PWA 및 관리자 PWA 설치 기기 분리 집계 및 최근 7일/30일 활성 기기 추적', isNew: true },
      { text: '관리자 매출 통계 화면에 PWA 설치 및 활성 기기 현황 (Analytics) 대시보드 카드 추가', isNew: true }
    ]
  },
  {
    version: 'v1.5.3',
    date: new Date().toISOString().split('T')[0],
    title: '사이드바 수평 구분선과 하단바 경계선 높이(90px) 1:1 완벽 정렬',
    updates: [
      { text: '관리자 좌측 사이드바 하단 구분선과 우측 메인 푸터 경계선을 1px 오차 없는 수평 일직선(90px)으로 정밀 맞춤', isNew: true }
    ]
  },
  {
    version: 'v1.5.2',
    date: new Date().toISOString().split('T')[0],
    title: '관리자 화면 하단 푸터 높이 확충 및 목록 N개씩 보기 여백 최적화',
    updates: [
      { text: '실시간 주문 현황 하단 푸터(주문수/총액/통계) 상하 수직 여백 확장으로 가시성 대폭 개선', isNew: true },
      { text: "주문 내역 및 입금 승인 내역의 'N개씩 보기' 선택 드롭다운 버튼 여백과 터치 영역 디자인 개선", isNew: true }
    ]
  },
  {
    version: 'v1.5.1',
    date: new Date().toISOString().split('T')[0],
    title: '관리자 PWA 태블릿/iOS Safe-Area 상단 잘림 및 하단 공백 제거',
    updates: [
      { text: '태블릿 및 iOS PWA 앱 실행 시 상단 헤더 글씨가 상태바에 잘리던 현상 보정 (Safe Area Inset 적용)', isNew: true },
      { text: '동적 뷰포트 높이(100dvh) 오작동으로 인한 하단 하얀 여백 띠 제거 및 레이아웃 밀림 해결', isNew: true }
    ]
  },
  {
    version: 'v1.5.0',
    date: new Date().toISOString().split('T')[0],
    title: '관리자 전용 독립 PWA 앱 구축 및 전용 로고(admin_logo) 적용',
    updates: [
      { text: '사용자 주문 앱과 분리된 관리자 전용 독립 PWA 매니페스트(manifest-admin.webmanifest, scope: /admin/) 구축', isNew: true },
      { text: '관리자 전용 로고(admin_logo.png) 기반 앱 아이콘(admin-pwa-192, admin-pwa-512, admin-apple-touch-icon) 및 admin.html 적용', isNew: true },
      { text: '관리자 앱 아이콘 테두리 하얀 여백 제거 및 로고 크기 꽉 차게 최적화 (단축명: 미션카페 관리자)', isNew: true },
      { text: 'Vercel /admin/* URL rewrite 설정으로 관리자 독립 홈 화면 추가 기능 지원', isNew: true }
    ]
  },
  {
    version: 'v1.4.15',
    date: new Date().toISOString().split('T')[0],
    title: '품절(Sold Out) 메뉴 카테고리 최하단 자동 정렬 기능 추가',
    updates: [
      { text: '품절 처리된 메뉴가 각 카테고리 목록에서 가장 맨 아래로 자동 이동하여 주문 시 가시성과 사용자 편의성 대폭 개선', isNew: true },
      { text: '검색 결과 목록에서도 품절 상품이 하단에 정렬되도록 로직 연동', isNew: true }
    ]
  },
  {
    version: 'v1.4.14',
    date: new Date().toISOString().split('T')[0],
    title: 'iOS Safari / Android PWA 홈 화면 추가 전용 PNG 브랜드 아이콘 변환 및 호환성 완료',
    updates: [
      { text: 'iOS 사파리(Safari) 홈 화면 추가 모달 및 PWA 앱 아이콘용 PNG 포맷(apple-touch-icon.png, pwa-192.png, pwa-512.png) 변환 동기화', isNew: true },
      { text: '아이폰 및 안드로이드 기기에서 "홈 화면에 추가" 시 신규 대표 브랜드 아이콘이 100% 정상 표시되도록 최적화', isNew: true }
    ]
  },
  {
    version: 'v1.4.13',
    date: new Date().toISOString().split('T')[0],
    title: 'PWA 앱 아이콘 및 파비콘 고해상도 브랜드 아이콘(app_icon.svg) 적용',
    updates: [
      { text: '홈 화면 추가 및 PWA 매니페스트 앱 아이콘을 고해상도 미션카페 대표 브랜드 이미지(app_icon.svg)로 전면 교체', isNew: true },
      { text: '푸시 알림 수신 시 노출되는 대표 브랜드 아이콘 및 파비콘 동기화 업데이트', isNew: true }
    ]
  },
  {
    version: 'v1.4.12',
    date: new Date().toISOString().split('T')[0],
    title: 'PWA 모바일 앱 화면 임의 확대(Pinch-to-zoom) 차단 및 네이티브 앱 UX 강화',
    updates: [
      { text: '두 손가락 핀치 줌(Pinch-to-zoom) 및 더블 탭을 통한 임의 화면 확대 방지 (네이티브 모바일 앱 경험 구현)', isNew: true },
      { text: 'iOS Safari 및 안드로이드 전 기기 터치 제스처 고정으로 흔들림 없는 단단한 사용자 인터페이스 제공', isNew: true }
    ]
  },
  {
    version: 'v1.4.11',
    date: new Date().toISOString().split('T')[0],
    title: 'PWA 앱 아이콘 알림 뱃지(숫자) 및 과거 알림 자동 리셋 구현',
    updates: [
      { text: '앱 접속 및 화면 활성화 시 상단 알림창의 과거 푸시 알림 배너 자동 닫기(Clean-up) 로직 도입', isNew: true },
      { text: '앱 아이콘에 과거 알림으로 인해 계속 누적되어 남아있던 알림 뱃지 숫자(App Badge) 자동 0으로 리셋 기능 추가', isNew: true }
    ]
  },
  {
    version: 'v1.4.10',
    date: new Date().toISOString().split('T')[0],
    title: '알림 배너 노출 조건 최적화 및 안드로이드 알림 뱃지 아이콘 개선',
    updates: [
      { text: '일반 웹(QR 접속) 환경에서는 상단 "알림 켜기" 배너를 숨기고, PWA 앱 실행 시에만 노출되도록 조건 최적화', isNew: true },
      { text: '안드로이드 푸시 알림 상단바 뱃지(Badge) 아이콘을 단색 실루엣 이미지로 교체하여 하얗게 채워지던 현상 완벽 수정', isNew: true }
    ]
  },
  {
    version: 'v1.4.9',
    date: new Date().toISOString().split('T')[0],
    title: '앱 설치 안내(PWA) 스크롤 가이드 및 통이미지 개선',
    updates: [
      { text: '앱 설치 가이드(안드로이드/아이폰)를 전체 화면 통이미지로 교체하여 스크롤하며 직관적으로 볼 수 있도록 개선', isNew: true },
      { text: '홈 화면의 "카페 주문 어플 설치하기" 배너를 고해상도 이미지로 교체하고 심장박동(Pulse) 애니메이션 효과를 주어 가시성 강화', isNew: true }
    ]
  },
  {
    version: 'v1.4.8',
    date: new Date().toISOString().split('T')[0],
    title: 'PWA 백그라운드 푸시 알림 정상화 및 안정성 강화',
    updates: [
      { text: '앱이 백그라운드에 있거나 화면이 잠긴 상태에서도 주문 준비 완료 알림이 안정적으로 도착하도록 개선', isNew: true },
      { text: '알림 전송 실패 시 제한된 재시도 및 지능형 구독 관리 로직(만료 구독 자동 삭제) 추가', isNew: true },
      { text: '주문 생성 직후 푸시 알림 구독을 자동으로 연결하여 알림 누락 최소화', isNew: true },
      { text: '기기 네트워크가 잠시 끊겨도 최대 1시간 내 복구 시 알림을 받을 수 있도록 오프라인 대응 강화(TTL 적용)', isNew: true },
      { text: '불필요한 인앱 중복 알림 제거 및 푸시 관련 백그라운드 네트워크 에러 시 전역 토스트 알림 표시 방지' }
    ]
  },
  {
    version: 'v1.4.7',
    date: new Date().toISOString().split('T')[0],
    title: '사용자 경험(UX) 개선 및 네이티브 앱 환경 최적화',
    updates: [
      { text: '상단 로고, 알림 켜기 배너, 앱 설치 가이드, 영업 종료 화면에 고해상도 맞춤형 통이미지 전면 적용', isNew: true },
      { text: '모바일 환경에서 화면 좌우 스와이프를 통해 메뉴 카테고리를 부드럽게 이동할 수 있는 제스처 기능 신규 추가', isNew: true },
      { text: '앱 사용성 강화를 위해 브라우저의 기본 스크롤바를 숨겨 완전한 네이티브 앱(Native App) 느낌 구현', isNew: true },
      { text: '아이폰(iOS Safari)에서 상단 검색창 터치 시 화면이 강제로 줌인(확대)되던 불편한 버그 완벽 해결', isNew: true },
      { text: '영업 종료 화면이 기기 화면 크기에 완벽히 고정되어 불필요하게 스크롤되지 않도록 레이아웃 고도화' }
    ]
  },
  {
    version: 'v1.4.6',
    date: new Date().toISOString().split('T')[0],
    title: '실시간 영업 상태(Open/Close) 동기화 도입 및 PWA 주문 안정성 최적화',
    updates: [
      { text: '관리자의 영업 상태 변경이 사용자 화면(홈/상세/장바구니)에 1~2초 내 실시간 반영되도록 지속 WebSocket 구조 도입', isNew: true },
      { text: 'WebSocket 유실 시 15초 단위 폴링 및 화면 활성화(Visibility/Online) 감지 기반 자동 설정 복구 로직 구축', isNew: true },
      { text: '주문서 작성 중 영업 종료 시 강제 튕김 처리 및 POST 주문 직전 3단계 검증으로 비정상 주문 완전 차단', isNew: true },
      { text: '공개 설정 API 캐싱 방지(Cache-Control: no-store) 및 관리자-사용자 Query Key 격리로 동기화 안정성 극대화', isNew: true }
    ]
  },
  {
    version: 'v1.4.5',
    date: new Date().toISOString().split('T')[0],
    title: '관리자 통계 강화 및 앱 주문 내역 관리 편의성 개선',
    updates: [
      { text: '매출 통계에 "단골 손님 랭킹" 모달 추가 (주차별/월별 최다 방문자 및 최고 큰 손 TOP 3 집계)', isNew: true },
      { text: '주문 내역 관리 및 입금 내역 페이지에서 PWA 앱을 통한 주문을 "앱 주문" 민트색 라벨로 명확히 구분', isNew: true },
      { text: '주문 내역 관리 상단에 "주문 유형별(앱/QR/현장) 필터" 드롭다운 신규 추가', isNew: true }
    ]
  },
  {
    version: 'v1.4.4',
    date: new Date().toISOString().split('T')[0], // 자동으로 오늘 날짜 입력
    title: '백그라운드 푸시 알림 도입 및 사용자 주문 UI 개선',
    updates: [
      { text: '앱 설치(PWA) 지원 및 주문 완료 시 스마트폰 자체 백그라운드 푸시 알림(소리/진동) 기능 전면 도입', isNew: true },
      { text: '사용자 화면 스크롤 시 발생하던 하단 검은색 그림자(그라데이션) 현상 플랫(Flat) 디자인으로 깔끔하게 개선', isNew: true }
    ]
  },
  {
    version: 'v1.4.3',
    date: '2026-06-22',
    title: '실시간 주문 보드 전면 개편 및 바리스타 편의성 극대화',
    updates: [
      { text: '실시간 주문 현황 보드를 컴팩트한 세로 3열 칸반 레이아웃으로 개편하여 한눈에 더 많은 주문을 파악할 수 있도록 개선', isNew: true },
      { text: '바리스타 전용 [총 제조메뉴] 요약 모달 신규 추가 (가장 오래 기다린 손님의 메뉴부터 직관적으로 쳐낼 수 있도록 정렬 로직 적용)', isNew: true },
      { text: '시스템 설정에서 전화번호 입력을 OFF할 경우 주문 카드에서도 전화번호가 숨겨지며 한층 더 콤팩트해지도록 최적화', isNew: true },
      { text: '주문 카드 내 메뉴명을 크고 선명한 폰트와 컬러로 강조하여 바쁜 환경에서도 가독성을 극대화', isNew: true },
      { text: '토스 자동 승인 시 입금 로그의 입금자명이 "토스 자동확인" 대신 실제 주문자명으로 기록되도록 수정 (정산 추적 편의성 개선)', isNew: true }
    ]
  },
  {
    version: 'v1.4.2',
    date: '2026-06-17',
    title: '통계 및 입금 로그 화면 사용성 고도화',
    updates: [
      { text: '정산 및 통계 화면의 총 주문 건수에 QR주문 및 현장주문 건수 구분 표시 추가', isNew: true },
      { text: '입금 승인 내역에서 모든 결제 유형의 주문번호 표시 기준 통일', isNew: true },
      { text: '입금 승인 내역의 주문번호 클릭 시 주문 내역 화면으로 이동하며 상세 모달이 자동 오픈되도록 개선', isNew: true }
    ]
  },
  {
    version: 'v1.4.1',
    date: '2026-06-15',
    title: '이벤트 주문 결제수단 표시 개선',
    updates: [
      { text: '관리자 화면 주문 현황 및 내역에서 이벤트(섬김의 시간) 주문 시 결제수단이 "사역자" 대신 "섬김후원"으로 명확하게 표시되도록 개선' }
    ]
  },
  {
    version: 'v1.4.0',
    date: '2026-06-14',
    title: '재고 관리 화면 고도화 및 정산 통계 개선',
    updates: [
      { text: '관리자 재고 관리 보드를 직관적인 칸반(Kanban) 스타일 레이아웃으로 전면 개편', isNew: true },
      { text: '각 품목 카드 내에서 즉각적인 수량 조절(+ / -) 기능 도입 (API 실시간 연동)', isNew: true },
      { text: '위험 재고(주문 필요) 항목이 카테고리 상관없이 눈에 띄도록 다중 표시 로직 적용', isNew: true },
      { text: '카드 내 메모 텍스트 가시성 강화를 위한 디자인 리뉴얼' },
      { text: '이벤트(골든벨/섬김)로 발생한 전액 할인 주문도 관리자 총 매출액 및 현금(섬김) 통계에 합산되도록 로직 개편' }
    ]
  },
  {
    version: 'v1.3.6',
    date: '2026-06-11',
    title: '시스템 안정화 및 주요 버그 수정',
    updates: [
      { text: '골든벨(이벤트) 모드 진행 후 정산 리포트에서 텀블러 할인이 비정상적으로 높게 집계되던 통계 오류 완벽 수정', isNew: true },
      { text: '아이패드에서 관리자 화면 스크롤이 두 번 겹쳐서 되거나 화면 하단에 흰 여백이 생기던 레이아웃 문제 해결', isNew: true },
      { text: '사용자 스마트폰 화면에서 메뉴 카테고리(커피, 논커피 등) 탭이 간혹 보이지 않던 버그 수정' },
      { text: '일부 환경에서 일반 사용자 화면의 위아래 스크롤이 먹통이 되던 현상 해결' }
    ]
  },
  {
    version: 'v1.3.5',
    date: '2026-05-30',
    title: '사용자 화면 개선 및 이벤트 관리 기능 강화',
    updates: [
      { text: '메뉴 가격 숨김 설정 기능 추가 (관리자 설정에서 토글로 켜고 끌 수 있습니다)', isNew: true },
      { text: '이벤트 관리 메뉴에 "사용자 화면 미리보기(눈 아이콘)" 버튼 신규 추가', isNew: true },
      { text: '일반 공지사항일 경우 이벤트 팝업에 "확성기" 아이콘이 표시되도록 개선', isNew: true },
      { text: '이벤트 상세 내용 작성 시 줄바꿈과 띄어쓰기가 사용자 화면에도 그대로 예쁘게 유지되도록 개선' },
      { text: '안정적인 서비스 운영을 위해 이벤트 배너 이미지 업로드 용량 10MB 제한 안내 추가' }
    ]
  },
  {
    version: 'v1.3.0',
    date: '2026-05-14',
    title: '정산 통계 강화 및 시스템 속도 최적화',
    updates: [
      { text: '정산 및 매출 통계에 "토스송금" 결제 수단 항목 추가 (계좌이체/토스/현금 개별 집계)', isNew: true },
      { text: '마감 리포트 생성 시 토스송금 매출 합계 정보 포함', isNew: true },
      { text: '관리자 페이지 전체적인 접속 및 화면 전환 속도 최적화', isNew: true },
      { text: '통계 차트 및 데이터 로딩 시각적 피드백 개선' }
    ]
  },
  {
    version: 'v1.2.5',
    date: '2026-05-13',
    title: '주문 내역 및 입금 확인 고도화',
    updates: [
      { text: '토스(Toss) 송금 결제 수단 도입 - 토스송금 클릭시 토스앱이 바로 실행되어 간편 송금 가능', isNew: true },
      { text: '사역자 및 식당 봉사자 전용 무료 주문 기능 도입 (QR주문은 불가, 관리자가 직접 추가 가능)', isNew: true },
      { text: '현장 주문 시 동일 메뉴 및 옵션 항목 자동 병합 기능 구현 (중복 표시 버그 수정)', isNew: true },
      { text: '시스템 설정 내 "업데이트 소식(릴리즈 노트)" 확인 기능 추가', isNew: true },
      { text: '주문 내역 히스토리에 주문 유형(QR주문/현장주문) 컬럼 추가', isNew: true },
      { text: '입금 승인 내역의 유형별 뱃지 색상 동기화 (QR: 초록, 현장: 카카오색)', isNew: true },
      { text: '주문 상세 모달에서 주문 유형 정보를 명확하게 표시' },
      { text: '관리자 페이지 전반적인 디자인 폴리싱 및 접근성 개선' }
    ]
  },
  {
    version: 'v1.2.0',
    date: '2026-05-12',
    title: '주문 편의성 향상 및 관리자 기능 확장',
    updates: [
      { text: '관리자 전용 "현장 주문" 직접 입력 기능 신규 도입', isNew: true },
      { text: '텀블러 선택 시 잔당 500원 자동 할인 로직 도입', isNew: true },
      { text: '재고 관리 항목 상세 보기 모달 인터페이스 구현', isNew: true },
      { text: '사용자 주문 취소 시 메뉴 화면으로 자동 복귀 로직 개선' },
      { text: '주문 삭제 시 연동된 입금 기록 및 이벤트 정산 데이터 자동 차감 처리' },
      { text: 'ICE/HOT 및 컵 선택 옵션 기본값 최적화 및 시각적 가시성 강화' },
      { text: '옵션 직접 입력 시 해당 필드로 자동 포커스 기능 추가' },
      { text: '결제 수단별 상세 안내(계좌번호 노출, 카운터 결제 안내) 추가' },
      { text: '소프트 삭제(Soft Delete) 적용을 통한 데이터 무결성 강화' }
    ]
  },
  {
    version: 'v1.1.5',
    date: '2026-05-08',
    title: '봉사자 스케줄 및 관리자 권한 세분화',
    updates: [
      { text: '주일 봉사자 스케줄 관리 기능 추가 (봉사자 명단 JSON 관리)', isNew: true },
      { text: 'MASTER / ADMIN 권한 분리 및 설정 접근 제어 강화' },
      { text: '비밀번호 변경 및 관리자 계정 생성 기능 추가' }
    ]
  },
  {
    version: 'v1.0.0',
    date: '2026-05-01',
    title: 'Mission-Cafe 시스템 정식 오픈',
    updates: [
      { text: '교회 카페 주문 시스템 구축', isNew: true },
      { text: 'QR 코드 기반 사용자 주문 및 실시간 주문 상태 연동' }
    ]
  }
];
