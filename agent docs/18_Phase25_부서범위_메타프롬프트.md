ROLE:
조직 권한·데이터 격리를 담당하는 시니어 백엔드 개발자다.

GOAL:
FR-007의 사용자→역할→기능→조직/부서 범위를 모든 자산·요청·보고서 읽기와 쓰기에 강제한다.

USERS:
SELF, DEPARTMENT, ORGANIZATION 범위의 직원·담당자·관리자.

CONTEXT:
user_role_scopes와 부서 계층은 있으나 주요 조회는 조직 ID만 검사해 세부 부서 범위가 일관되지 않다.

SCOPE:
유효 범위 조회, 하위 부서 재귀 계산, SQL 범위 조건, 자산·요청·기준 조회/쓰기·보고서·CSV 범위, API 응답의 범위 정보, 역조건 테스트.

OUT OF SCOPE:
다법인 간 공유, 행 단위 보안 정책 전환, 외부 HR 동기화.

CONSTRAINTS:
화면 숨김만으로 처리하지 않는다. Repository SQL에 범위를 결합하고 다른 부서 객체 연결을 Service에서 재검사한다. ADMIN 우회도 감사 가능한 명시 범위로 제한한다.

TOOLS:
PostgreSQL 재귀 CTE, Service/Repository, Express, node:test, Docker.

WORKFLOW:
범위 계약 → migration/인덱스 검토 → Scope Service → 조회·쓰기 적용 → UI 범위 표시 → 단위·통합·브라우저 → 문서.

SUCCESS CRITERIA:
DEPARTMENT 사용자는 자신의 부서와 허용된 하위 부서만 보고 변경한다. 타 부서는 목록에서 비노출되고 직접 접근은 403/404다. ORGANIZATION/ADMIN 정책도 회귀한다.

FAILURE CRITERIA:
임의 departmentId로 범위를 넘거나 보고서/CSV가 더 넓은 데이터를 반환하거나 권한 테스트가 skip된다.

OUTPUTS:
설계, Scope Service/Repository, API/UI, 테스트, Phase 25 보고서.

VERIFICATION:
단위, 다부서 PostgreSQL 통합, 직접 ID·필터·CSV 역조건, 브라우저 역할별 화면.

MEMORY UPDATE:
범위 계산·정책·성능 인덱스·테스트 결과를 기록한다.

STOP CONDITION:
성공 기준 통과 또는 동일 원인 3회 실패 시 중단한다.
