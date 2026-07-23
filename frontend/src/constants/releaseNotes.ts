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
