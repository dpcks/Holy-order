# [TASK] 봉사자 격려 구절 구현 작업

## Step 1: 유틸리티 및 데이터 생성
- [x] `src/utils/bibleVerses.ts` 파일 생성
- [x] `BibleVerse` 인터페이스 정의 (text, ref)
- [x] 제공된 15개 이상의 성경 구절 리스트(`VOLUNTEER_VERSES`) 배열 추가
- [x] `getDailyVerse` 함수 구현 (날짜 기반 인덱싱 로직 포함)

## Step 2: UI 컴포넌트 통합
- [x] `src/pages/admin/AdminSchedule.tsx` 파일 수정
- [x] `lucide-react`에서 `Quote`, `Sparkles` 아이콘 임포트
- [x] `useState`를 활용하여 컴포넌트 마운트 시 `getDailyVerse()` 호출 및 상태 저장
- [x] 기존 AdminSchedule 레이아웃 내 상단 격려 카드 섹션 삽입

## Step 3: 스타일링 및 검증
- [x] Tailwind CSS 클래스(bg-gradient-to-br, backdrop-blur-md 등) 적용 확인
- [x] 모바일/데스크톱 반응형 렌더링 확인 (md:flex 클래스 등)
- [x] 구절 텍스트가 정상적으로 표시되는지 테스트