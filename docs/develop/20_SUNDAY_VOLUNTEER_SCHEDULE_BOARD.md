# 관리자 봉사 스케줄 — 주일 전용 주차 보드 리디자인

## 1. 문서 목적

Holy-Order는 교회 카페이며 실제 운영일이 **매주 일요일**이다. 현재 관리자 봉사 스케줄 화면은 일반 월간 달력처럼 월요일부터 토요일까지 모든 날짜를 표시하지만, 실제로 편집 가능한 날짜는 일요일뿐이다.

이번 작업의 목표는 불필요한 평일 칸을 제거하고, 해당 월의 주일만 다음과 같이 보여주는 **월별 주차 카드 보드**로 바꾸는 것이다.

```text
2026년 7월
→ 1주차 · 7월 5일 주일
→ 2주차 · 7월 12일 주일
→ 3주차 · 7월 19일 주일
→ 4주차 · 7월 26일 주일

2026년 8월
→ 1주차 · 8월 2일 주일
→ 2주차 · 8월 9일 주일
→ 3주차 · 8월 16일 주일
→ 4주차 · 8월 23일 주일
→ 5주차 · 8월 30일 주일
```

여기서 `1주차`는 일반 달력의 첫 번째 행이 아니라, **그 달의 첫 번째 주일**을 의미한다.

---

## 2. 현재 저장소 기준 구조

구현 전에 최신 `main` 브랜치에서 아래 파일을 먼저 읽고 실제 코드와 타입을 확인한다.

### 프런트엔드

```text
frontend/src/pages/admin/AdminSchedule.tsx
frontend/src/api/queryKeys.ts
frontend/src/types/index.ts
frontend/src/pages/admin/AdminLayout.tsx
frontend/src/components/ui/Skeleton.tsx
frontend/src/components/ui/Toast.tsx
```

현재 `AdminSchedule.tsx`의 주요 특징은 다음과 같다.

```text
- startOfWeek / endOfWeek로 앞뒤 달 날짜까지 포함한 달력 범위를 계산함
- 일~토 7열 그리드를 렌더링함
- 실제 클릭 가능한 날짜는 day.getDay() === 0인 일요일뿐임
- 주일 칸에 봉사자 이름, 특이사항, 미배정 상태를 표시함
- 주일을 클릭하면 오른쪽 편집 사이드바가 열림
- 편집 사이드바에서 봉사자 선택, 명단 추가/삭제, 메모, 저장을 처리함
- GET /admin/schedules?start_date=...&end_date=... 사용
- POST /admin/schedules로 특정 주일을 upsert함
```

### 백엔드

```text
backend/models.py
backend/schemas.py
backend/routers/admin.py
backend/tests/*
```

현재 백엔드는 이미 주일 중심 데이터 구조를 사용한다.

```text
VolunteerSchedule.sunday_date
→ Date, unique, nullable=False

GET /api/v1/admin/schedules
→ start_date / end_date 범위 조회

POST /api/v1/admin/schedules
→ sunday_date 기준 생성 또는 수정
```

따라서 핵심 UI 전환에는 새로운 DB 테이블이나 컬럼이 필요하지 않다.

---

## 3. 현재 문제

### 3-1. 화면 대부분이 실제로 사용하지 않는 날짜임

관리자는 일요일만 편집할 수 있는데 월~토까지 모두 렌더링된다.

```text
월간 35~42개 날짜 칸
→ 실제 관리 대상은 4~5개 주일뿐
```

그 결과 다음 문제가 있다.

```text
- 한 달 봉사 배정 상태를 빠르게 파악하기 어려움
- 미배정 주일이 작은 달력 칸에 묻힘
- 태블릿과 작은 노트북에서 글자가 지나치게 작아짐
- 빈 평일 칸이 화면 공간 대부분을 차지함
- 4주차인지 5주차인지 즉시 알기 어려움
```

### 3-2. 현재 월 외 날짜까지 조회·표시함

현재 달력 범위는 해당 월의 첫 주와 마지막 주를 채우기 위해 앞뒤 달 날짜를 포함한다. 주일 전용 화면에서는 해당 월의 주일만 있으면 되므로 월 시작일과 종료일만 조회하는 것이 더 명확하다.

### 3-3. 서버가 평일 스케줄 요청을 명시적으로 거부하지 않음

모델 필드명과 주석은 `sunday_date`이지만 요청 스키마는 실제 일요일인지 검증하지 않는다. 직접 API를 호출하면 평일 날짜가 저장될 수 있다.

### 3-4. 서버 데이터에서 로컬 state로 동기화하는 코드가 렌더 중 실행됨

현재 코드에는 렌더 과정에서 조건부로 `setSchedules()`를 호출하는 구조가 있다.

```tsx
if (fetchedSchedules && fetchedSchedules !== schedules) {
  if (!selectedDate) setSchedules(fetchedSchedules);
}
```

이번 리디자인 과정에서 이 동기화는 `useEffect` 기반으로 정리하여 렌더 중 상태 변경을 제거한다.

---

## 4. 최종 목표

관리자는 한 달에 존재하는 4개 또는 5개의 주일 카드만 보고 다음을 즉시 판단할 수 있어야 한다.

```text
- 이번 달 주일이 총 몇 번인지
- 몇 주가 배정 완료인지
- 몇 주가 미배정인지
- 이번 주일 또는 다음 운영 주일이 언제인지
- 각 주일에 누가 봉사하는지
- 특이사항이 있는지
```

카드를 선택하면 기존 오른쪽 편집 사이드바를 그대로 활용해 봉사자와 메모를 수정할 수 있어야 한다.

---

## 5. 필수 UX 설계

## 5-1. 월 이동 헤더

상단에는 다음 항목을 배치한다.

```text
[이전 달]  2026년 8월  [다음 달]  [이번 달]
```

기존 이전·다음 달 버튼은 유지한다. 추가로 `이번 달` 버튼을 제공해 여러 달을 이동한 뒤 현재 달로 즉시 돌아올 수 있게 한다.

### 월 요약

같은 헤더 또는 바로 아래 요약 영역에 다음 값을 표시한다.

```text
주일 5회
배정 완료 4회
미배정 1회
```

정의는 다음과 같다.

```text
배정 완료
→ volunteers.names에 1명 이상 존재

미배정
→ 스케줄 행이 없거나 volunteers.names가 빈 배열

메모만 존재하고 봉사자가 없는 경우
→ 미배정으로 계산
→ 카드에는 "특이사항 있음"도 함께 표시 가능
```

## 5-2. 주일 카드 보드

해당 월의 일요일만 계산해 카드로 렌더링한다.

```text
1주차 · 8월 2일 주일
2주차 · 8월 9일 주일
3주차 · 8월 16일 주일
4주차 · 8월 23일 주일
5주차 · 8월 30일 주일
```

카드 수는 하드코딩하지 않는다.

```text
일요일이 4번인 달
→ 카드 4개

일요일이 5번인 달
→ 카드 5개
```

### 주차 번호 계산 규칙

```ts
weekNumber = sundaysOfMonth 배열의 index + 1
```

다음 방식으로 계산하지 않는다.

```ts
Math.floor((date.getDate() - 1) / 7) + 1
```

이 작업에서 `N주차`는 달력상의 주차가 아니라 **그 달의 N번째 주일**이기 때문이다.

## 5-3. 카드 필수 정보

각 카드에는 다음을 표시한다.

```text
- 1주차 / 2주차 / ...
- M월 D일 주일
- 배정 완료 또는 미배정 상태 배지
- 배정된 봉사자 이름 칩
- 배정 인원 수
- 메모가 있으면 "특이사항 있음" 배지
- 편집 버튼 또는 카드 전체 클릭 동작
```

예시:

```text
┌────────────────────────┐
│ [이번 주일]      2주차 │
│ 8월 9일 주일           │
│                        │
│ 김성도  이집사  박청년 │
│                        │
│ 3명 배정               │
│ 특이사항 있음   [편집] │
└────────────────────────┘
```

미배정 예시:

```text
┌────────────────────────┐
│ [미배정]         5주차 │
│ 8월 30일 주일          │
│                        │
│ 봉사자를 배정해 주세요 │
│                        │
│ 0명             [배정] │
└────────────────────────┘
```

봉사자가 많아도 카드 높이가 무한히 커지지 않도록 한다.

```text
최대 몇 명까지 이름 칩 직접 표시
나머지는 +N명으로 표시
```

구체적인 표시 개수는 현재 카드 폭을 보고 3~5명 범위에서 결정한다.

## 5-4. 시간 상태 강조

각 주일 카드는 날짜에 따라 시각적으로 구분한다.

```text
지난 주일
→ 채도와 강조를 낮춤

오늘이 주일이며 해당 날짜인 경우
→ "오늘" 또는 "이번 주일" 강조

오늘 이후 가장 가까운 주일
→ "다음 주일" 강조

그 외 미래 주일
→ 기본 상태
```

한 달에 강조 카드가 여러 개 생기지 않게 한다.

## 5-5. 반응형 레이아웃

권장 기준:

```text
휴대전화 관리자 PWA
→ 1열 세로 카드

태블릿
→ 2열 또는 3열

일반 데스크톱
→ 4열

충분히 넓은 데스크톱
→ 5주가 있는 달에 5열 가능
```

Tailwind 예시 방향:

```tsx
grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5
```

정확한 breakpoint는 기존 관리자 사이드바 폭과 실제 콘텐츠 영역을 보고 조정한다.

필수 조건:

```text
- 카드 본문 때문에 페이지 전체에 가로 스크롤이 생기지 않음
- iPad에서 카드와 편집 사이드바가 겹쳐 조작 불가능해지지 않음
- 관리자 레이아웃의 100dvh 및 overflow 정책을 깨지 않음
```

## 5-6. 로딩·빈 상태

기존 날짜 칸용 `DaySkeleton`을 주일 카드용 스켈레톤으로 바꾼다.

```text
4주인 달
→ 4개 스켈레톤

5주인 달
→ 5개 스켈레톤
```

스케줄 행이 하나도 없어도 해당 월의 주일 카드 자체는 모두 보여야 하며 전부 `미배정`으로 표시한다.

---

## 6. 편집 사이드바 요구사항

현재 오른쪽 오버레이 편집 사이드바의 핵심 기능은 유지한다.

```text
- 봉사자 선택/해제
- 봉사자 마스터 명단 편집
- 봉사자 추가
- 봉사자 삭제
- 특이사항 및 메모 입력
- 주일별 저장
- 저장 성공/실패 토스트
```

카드 클릭 시:

```text
selectedDate = 해당 sunday_date
→ 기존 편집 사이드바 열림
```

사이드바 헤더에는 주차 번호도 표시한다.

```text
2주차
8월 9일 주일
```

저장은 기존처럼 한 주일 단위로 처리한다.

```text
POST /api/v1/admin/schedules
```

월 전체를 자동으로 한 번에 저장하거나 다른 주차를 함께 덮어쓰지 않는다.

### 편집 중 서버 데이터 동기화

서버 refetch가 편집 중인 로컬 값을 덮어쓰지 않아야 한다.

권장 구조:

```text
사이드바가 닫혀 있음
→ fetchedSchedules를 로컬 state에 동기화

사이드바가 열려 있고 편집 중
→ 자동으로 현재 편집 draft를 덮어쓰지 않음
```

이 로직은 렌더 본문이 아니라 `useEffect`에서 처리한다.

---

## 7. 편의 기능

## 7-1. 필수: 이번 달로 이동

헤더에 `이번 달` 버튼을 추가한다.

## 7-2. 권장: 이전 주일 봉사자 불러오기

편집 사이드바에 다음 보조 버튼을 추가할 수 있다.

```text
[이전 주일 봉사자 불러오기]
```

동작 원칙:

```text
- 이전 주일의 volunteers.names만 현재 draft로 복사
- memo는 자동 복사하지 않음
- 현재 주일에 이미 봉사자가 있으면 확인창 표시
- 자동 저장하지 않음
- 관리자가 확인 후 기존 저장 버튼을 눌러야 반영
```

첫 번째 주일에서 이전 주일이 전월에 있는 경우 기존 범위 조회 API를 사용해 해당 날짜만 조회할 수 있다.

```text
GET /admin/schedules?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
```

이 기능이 구현 복잡도나 회귀 위험을 크게 높이면 핵심 카드 보드 구현을 우선 완료하고 결과 보고에서 별도 후속 항목으로 남긴다.

## 7-3. 이번 작업에서 제외: 지난달 전체 자동 복사

다음 기능은 이번 작업에 포함하지 않는다.

```text
지난달 1~5주차를 이번 달 전체에 즉시 복사·저장
```

여러 POST 요청의 부분 성공과 기존 배정 덮어쓰기 정책을 별도로 설계해야 하므로 별도 작업으로 분리한다.

---

## 8. 프런트엔드 구현 요구사항

## 8-1. 주일 배열 계산

기존 `calendarDays` 대신 해당 월의 날짜 중 일요일만 추출한다.

개념 예시:

```tsx
const sundaysOfMonth = useMemo(() => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  return eachDayOfInterval({
    start: monthStart,
    end: monthEnd,
  }).filter((day) => day.getDay() === 0);
}, [currentDate]);
```

또는 `date-fns`의 동등한 안전한 방법을 사용할 수 있다.

주의:

```text
- YYYY-MM-DD 문자열을 new Date("YYYY-MM-DD")로 직접 파싱해 UTC 날짜 이동을 만들지 않음
- 현재 코드의 로컬 날짜 parseDate 방식 또는 date-fns 로컬 날짜 방식을 유지
```

## 8-2. 조회 범위

주일 카드만 보여주므로 기본 조회 범위는 해당 월의 시작일과 종료일로 정리한다.

```tsx
const startDate = format(startOfMonth(currentDate), 'yyyy-MM-dd');
const endDate = format(endOfMonth(currentDate), 'yyyy-MM-dd');
```

기존 Query Key 구조는 유지한다.

```tsx
QK.schedules.list({ start: startDate, end: endDate })
```

## 8-3. 상태 계산은 파생값으로 구성

다음 값은 가능하면 별도 mutable state보다 `useMemo` 또는 계산식으로 만든다.

```text
sundaysOfMonth
assignedCount
unassignedCount
nextSundayDate
selectedWeekNumber
```

## 8-4. 컴포넌트 분리

`AdminSchedule.tsx`가 과도하게 커지지 않도록 다음 정도의 분리를 고려한다.

```text
frontend/src/components/admin/SundayScheduleCard.tsx
frontend/src/components/admin/SundayScheduleCardSkeleton.tsx
```

단, 현재 프로젝트 관례상 한 파일 유지가 더 적절하면 무리하게 파일을 늘리지 않는다.

## 8-5. 기존 기능 회귀 금지

다음은 그대로 동작해야 한다.

```text
- 월 이동
- 스케줄 범위 조회
- 봉사자 목록 조회
- 봉사자 추가·삭제
- 주일별 봉사자 선택
- 메모 수정
- 주일별 저장
- 저장 후 Query invalidate
- Toast
- 성경 구절 격려 카드
- 관리자 인증
```

---

## 9. 백엔드 보완 요구사항

## 9-1. 일요일 날짜 검증

`VolunteerScheduleUpdate.sunday_date`에 실제 일요일 검증을 추가한다.

Python `date.weekday()` 기준:

```text
월요일 = 0
...
일요일 = 6
```

예시:

```python
class VolunteerScheduleUpdate(BaseModel):
    sunday_date: date
    volunteers: Optional[VolunteerData] = None
    memo: Optional[str] = None

    @field_validator("sunday_date")
    @classmethod
    def validate_sunday(cls, value: date) -> date:
        if value.weekday() != 6:
            raise ValueError(
                "봉사 스케줄은 일요일만 등록할 수 있습니다."
            )
        return value
```

현재 Pydantic 버전과 코드 스타일에 맞게 적용한다.

## 9-2. mutable 기본값 정리

현재 `VolunteerData.names`가 빈 리스트 리터럴을 기본값으로 사용한다면 다음처럼 정리한다.

```python
names: List[str] = Field(default_factory=list)
```

## 9-3. 기존 평일 데이터 점검

배포 전에 기존 테이블에 평일 스케줄이 있는지 확인한다.

PostgreSQL 진단 예시:

```sql
SELECT id, sunday_date
FROM volunteer_schedules
WHERE EXTRACT(DOW FROM sunday_date) <> 0
ORDER BY sunday_date;
```

PostgreSQL의 `EXTRACT(DOW ...)`에서 일요일은 `0`이다.

평일 행이 발견되면:

```text
- 자동 삭제하지 않음
- 자동으로 가장 가까운 일요일로 이동하지 않음
- 결과 보고에 목록과 정리 방안만 제시
```

## 9-4. API 계약 유지

다음 엔드포인트와 응답 구조를 유지한다.

```text
GET  /api/v1/admin/schedules
POST /api/v1/admin/schedules
GET  /api/v1/admin/volunteers
POST /api/v1/admin/volunteers
DELETE /api/v1/admin/volunteers/{id}
```

핵심 화면 개편을 위해 새 DB 마이그레이션이나 새 API를 만들지 않는다.

---

## 10. 타입 정합성

백엔드 응답은 `volunteers`와 `memo`가 비어 있을 수 있다. 프런트 타입이 항상 non-null로 선언돼 있다면 실제 응답과 맞게 정리한다.

예시 방향:

```ts
export interface VolunteerSchedule {
  id: number;
  sunday_date: string;
  volunteers: VolunteerData | null;
  memo: string | null;
}
```

단, 백엔드가 현재 응답 가공에서 항상 `{}`와 빈 문자열로 정규화한다면 실제 반환값을 먼저 확인하고 그 계약에 맞춰 일관되게 선택한다.

UI에서는 항상 안전하게 처리한다.

```ts
const names = Array.isArray(schedule?.volunteers?.names)
  ? schedule.volunteers.names
  : [];
```

---

## 11. 변경하지 말아야 할 사항

이번 작업에서는 다음을 하지 않는다.

```text
- VolunteerSchedule 테이블 재설계
- sunday_date 컬럼 변경
- 월~토 스케줄 지원 추가
- 자동 순번 배정 알고리즘 추가
- 봉사자 출석·근태 기능 추가
- 전체 월 일괄 저장 API 추가
- 지난달 전체 자동 복사 기능 구현
- 관리자 WebSocket 또는 주문 알림음 수정
- 사용자 주문·결제·푸시 기능 수정
- 관리자 전체 디자인 전면 개편
- 새 날짜 라이브러리 도입
- 관련 없는 패키지 업데이트
```

---

## 12. 예상 변경 파일

최소 검토 대상:

```text
frontend/src/pages/admin/AdminSchedule.tsx
frontend/src/api/queryKeys.ts
frontend/src/types/index.ts
backend/schemas.py
backend/routers/admin.py
backend/tests/*
```

선택적 신규 파일:

```text
frontend/src/components/admin/SundayScheduleCard.tsx
frontend/src/components/admin/SundayScheduleCardSkeleton.tsx
```

`models.py`와 DB 마이그레이션은 변경할 필요가 없어야 한다. 변경이 필요하다고 판단하면 먼저 이유를 결과 보고에 명시하고 임의로 범위를 확장하지 않는다.

---

## 13. 자동 테스트

## 13-1. 백엔드

최소한 다음 테스트를 추가하거나 보완한다.

```text
1. 일요일 날짜로 스케줄 생성 성공
2. 같은 일요일 날짜로 다시 저장하면 update/upsert 성공
3. 평일 날짜로 저장 요청 시 422
4. start_date/end_date 범위 조회가 정확함
5. 조회 결과가 sunday_date 오름차순임
6. 관리자 인증이 없는 요청은 차단됨
7. 기존 봉사자 추가·삭제 API 회귀 없음
```

실제 저장소 테스트 구조에 맞춰 실행한다.

```bash
pytest
```

## 13-2. 프런트엔드

최소 실행:

```bash
cd frontend
npm run lint
npm run build
```

기존 테스트 프레임워크가 없다면 이번 UI 작업만을 위해 새로운 대규모 테스트 도구를 추가하지 않는다.

순수 함수로 주일 배열 계산을 분리하고 기존 테스트 도구가 있다면 다음을 테스트한다.

```text
2026년 7월 → 일요일 4개
2026년 8월 → 일요일 5개
주차 번호 → 1부터 순서대로 증가
```

---

## 14. 수동 QA

## 14-1. 4주 달

```text
2026년 7월
일요일: 5, 12, 19, 26
```

기대 결과:

```text
카드 4개만 표시
1주차~4주차
5주차 빈 카드가 생기지 않음
```

## 14-2. 5주 달

```text
2026년 8월
일요일: 2, 9, 16, 23, 30
```

기대 결과:

```text
카드 5개 표시
1주차~5주차
```

## 14-3. 배정 상태

```text
봉사자 2명 존재
→ 배정 완료, 2명 표시

행 없음
→ 미배정

행은 있지만 names=[]
→ 미배정

memo만 존재
→ 미배정 + 특이사항 있음
```

## 14-4. 편집

```text
카드 클릭
→ 올바른 날짜와 주차의 사이드바 열림

봉사자 선택 후 저장
→ 카드 즉시 갱신

메모 저장
→ 특이사항 배지 표시

봉사자 추가·삭제
→ 명단과 선택 UI 정상 갱신
```

## 14-5. 월 이동

```text
이전 달 / 다음 달
→ 카드와 API 범위가 함께 변경

이번 달 버튼
→ 현재 월로 복귀
```

## 14-6. 반응형

다음 환경을 확인한다.

```text
휴대전화 관리자 PWA
아이패드 세로
아이패드 가로
일반 노트북
1440px 이상 데스크톱
```

## 14-7. 서버 검증

평일 날짜로 직접 API 요청:

```json
{
  "sunday_date": "2026-08-03",
  "volunteers": { "names": ["테스트"] },
  "memo": "평일 저장 테스트"
}
```

기대 결과:

```text
422 validation error
DB 행 생성 안 됨
```

---

## 15. 완료 기준

아래 조건을 모두 만족해야 완료로 간주한다.

```text
1. 월~토 날짜 칸이 관리자 스케줄 화면에서 사라짐
2. 해당 월의 일요일만 4개 또는 5개 카드로 표시됨
3. N주차는 해당 월의 N번째 주일 기준임
4. 배정 완료·미배정 수가 정확함
5. 미배정 주일이 시각적으로 명확함
6. 이번/다음 주일이 한 개만 강조됨
7. 카드 클릭으로 기존 편집 사이드바가 정상 열림
8. 봉사자 선택·추가·삭제·메모·저장 기능이 유지됨
9. 저장 후 카드가 최신 데이터로 갱신됨
10. 렌더 중 setState 구조가 제거됨
11. 평일 스케줄 POST가 서버에서 거부됨
12. DB 스키마 변경 없이 동작함
13. iPad와 관리자 PWA에서 가로 스크롤 없이 사용 가능함
14. pytest, lint, build 결과가 보고됨
15. 주문·결제·푸시·WebSocket 기능에 회귀가 없음
```

---

## 16. 배포 순서

```text
1. 기존 volunteer_schedules 평일 데이터 진단
2. 백엔드 sunday_date 검증과 테스트 배포
3. 프런트엔드 주일 카드 보드 배포
4. 4주 달과 5주 달 수동 QA
5. 봉사자 추가·삭제·주일별 저장 QA
6. iPad 및 관리자 PWA QA
```

백엔드 검증을 먼저 배포하더라도 기존 정상 일요일 저장 요청은 그대로 동작해야 한다.

---

## 17. 롤백

프런트엔드 UI 문제 발생 시:

```text
AdminSchedule.tsx를 기존 7열 달력 버전으로 롤백
```

백엔드 검증 문제 발생 시:

```text
VolunteerScheduleUpdate의 sunday_date validator만 롤백
```

DB 스키마 변경이 없으므로 데이터 롤백은 필요하지 않아야 한다.

---

## 18. 완료 보고 형식

작업 후 다음 순서로 보고한다.

```text
1. 기존 화면 문제와 최종 설계 요약
2. 실제 변경 파일
3. 주일 및 주차 계산 방식
4. 카드 상태 계산 방식
5. 편집 사이드바 보존 내용
6. 백엔드 일요일 검증
7. 기존 평일 데이터 진단 결과
8. 실행한 테스트 명령
9. pytest / lint / build 결과
10. 4주·5주 달 QA 결과
11. iPad·관리자 PWA QA 결과
12. 배포 순서
13. 롤백 방법
14. 남은 위험과 후속 기능 후보
```
