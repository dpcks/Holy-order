# Antigravity 실행 프롬프트 — 관리자 주일 전용 봉사 스케줄 보드

저장소 루트에서 다음 문서를 먼저 읽고, 문서에 정의된 범위만 구현해 주세요.

```text
docs/antigravity/20_SUNDAY_VOLUNTEER_SCHEDULE_BOARD.md
```

## 작업 목표

현재 관리자 봉사 스케줄 화면은 일~토 7열 달력을 렌더링하지만 실제 관리 대상은 일요일뿐입니다.

이를 다음 구조의 **월별 주일 전용 주차 카드 보드**로 변경하세요.

```text
해당 월의 첫 번째 주일 → 1주차
해당 월의 두 번째 주일 → 2주차
해당 월의 세 번째 주일 → 3주차
해당 월의 네 번째 주일 → 4주차
다섯 번째 주일이 있는 달 → 5주차
```

4주인 달에는 4개 카드만, 5주인 달에는 5개 카드만 보여야 합니다.

## 먼저 확인할 파일

```text
frontend/src/pages/admin/AdminSchedule.tsx
frontend/src/api/queryKeys.ts
frontend/src/types/index.ts
backend/routers/admin.py
backend/schemas.py
backend/models.py
backend/tests/*
```

최신 저장소를 전체 검색하고 현재 API, 타입, 스타일을 기준으로 구현하세요. 문서의 코드 예시는 개념 예시이며 맹목적으로 복사하지 마세요.

## 필수 구현

1. 월~토 날짜 칸을 제거하고 해당 월의 일요일만 카드로 렌더링하세요.
2. 주차 번호는 `(day - 1) / 7`이 아니라 `sundaysOfMonth`의 배열 순서 `index + 1`로 계산하세요.
3. 월 헤더에 이전 달, 다음 달, 이번 달 이동과 다음 요약을 표시하세요.

```text
주일 N회
배정 완료 N회
미배정 N회
```

4. `volunteers.names`가 1명 이상일 때만 배정 완료로 계산하세요. 메모만 있으면 미배정입니다.
5. 카드에 주차, 날짜, 봉사자, 인원, 미배정 상태, 특이사항 여부를 표시하세요.
6. 지난 주일은 약하게, 오늘 또는 다음 주일 한 개는 명확하게 강조하세요.
7. 카드 클릭 시 기존 오른쪽 편집 사이드바를 열고 다음 기능을 모두 유지하세요.

```text
봉사자 선택/해제
봉사자 명단 추가/삭제
메모 입력
주일별 저장
Toast
React Query invalidate
```

8. 현재 렌더 본문에서 실행되는 `setSchedules()` 동기화를 `useEffect`로 옮기세요. 편집 중인 draft는 refetch로 덮어쓰지 마세요.
9. 조회 범위는 기본적으로 해당 월의 시작일과 종료일을 사용하고 기존 `QK.schedules.list` 구조를 유지하세요.
10. `VolunteerScheduleUpdate.sunday_date`에 실제 일요일 검증을 추가하세요. 평일 POST는 422가 되어야 합니다.
11. `VolunteerData.names`의 mutable 빈 리스트 기본값은 `Field(default_factory=list)`로 정리하세요.
12. DB 테이블과 API 경로는 변경하지 마세요.
13. 휴대전화 관리자 PWA, iPad, 데스크톱에서 가로 스크롤 없이 사용할 수 있게 반응형으로 구성하세요.

## 편의 기능

`이번 달` 버튼은 필수입니다.

문서에 정의된 `이전 주일 봉사자 불러오기`는 핵심 구현과 테스트가 안정된 뒤 적용할 수 있습니다. 구현한다면 봉사자 이름만 draft로 복사하고, memo는 복사하지 않으며, 자동 저장하지 마세요.

`지난달 전체 자동 복사`는 이번 작업 범위가 아닙니다.

## 변경 금지

```text
VolunteerSchedule DB 재설계
월 전체 일괄 저장 API
월~토 스케줄 지원
주문·결제·푸시 수정
관리자 WebSocket 또는 알림음 수정
관리자 전체 UI 전면 개편
새 날짜 라이브러리 추가
관련 없는 패키지 업데이트
```

## 데이터 안전

배포 전에 기존 평일 스케줄이 있는지 진단하세요.

```sql
SELECT id, sunday_date
FROM volunteer_schedules
WHERE EXTRACT(DOW FROM sunday_date) <> 0
ORDER BY sunday_date;
```

평일 행이 있어도 자동 삭제하거나 날짜를 임의 이동하지 말고 결과에 보고하세요.

## 검증

최소 실행:

```bash
pytest
cd frontend && npm run lint
cd frontend && npm run build
```

필수 수동 QA:

```text
2026년 7월 → 4주 카드: 5, 12, 19, 26
2026년 8월 → 5주 카드: 2, 9, 16, 23, 30

행 없음 → 미배정
names=[] → 미배정
memo만 있음 → 미배정 + 특이사항 있음
봉사자 1명 이상 → 배정 완료

카드 클릭 → 정확한 날짜 사이드바
저장 → 카드 즉시 갱신
평일 POST → 422
```

휴대전화 관리자 PWA, iPad 세로·가로, 일반 데스크톱에서 확인하세요.

## 완료 보고

계획만 작성하고 멈추지 말고 실제 코드 수정, 백엔드 테스트, 프런트엔드 lint/build까지 완료하세요.

최종 보고에는 다음을 포함하세요.

```text
변경 파일
주일 계산 방식
주차 번호 계산 방식
배정/미배정 계산 방식
편집 사이드바 보존 내용
백엔드 일요일 검증
기존 평일 데이터 진단 결과
테스트·빌드 결과
4주·5주 달 QA
iPad·관리자 PWA QA
배포 순서
롤백 방법
남은 위험
```
