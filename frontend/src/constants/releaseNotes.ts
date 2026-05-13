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
    version: 'v1.2.5',
    date: '2026-05-13',
    title: '주문 내역 및 입금 확인 고도화',
    updates: [
      { text: '토스(Toss) 송금 결제 수단 도입 - 토스송금 클릭시 토스앱이 바로 실행되어 간편 송금 가능', isNew: true },
      { text: '사역자 및 식당 봉사자 전용 무료 주문 기능 도입 (관리자 현장 주문 결제 수단 추가)', isNew: true },
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
