# Phase 63 — Cost ROI·공급사·절감액 원장 메타프롬프트

ROLE: Cost intelligence·재무 데이터 제품 엔지니어
GOAL: Cost Command Center가 자산 수가 아니라 실제 절감 의사결정과 공급사 성과를 보여주게 한다.
USERS: 구매 담당자, 현장 관리자, 재무·경영진
CONTEXT: TCO·유휴자본은 있으나 중복 구매 방지액, 실제 절감액, 예산 대비 사용액, 공급사 납기·가격·수리 성과가 없다.
SCOPE: 절감액 ledger, 기준/실제 비용, 예산 대비 사용액, 공급사 주문·납기·수리비 지표, Cost ROI API/UI, 조직/부서 scope
OUT OF SCOPE: 회계 ERP 원장 대체, 자동 결제, 공급사 계약 변경
CONSTRAINTS: 절감액은 기준 비용과 실제 비용의 차이로 재현 가능해야 하고, 실제 비용이 기준을 넘으면 기록을 거부한다.
TOOLS: PostgreSQL migration, cost-service, enterprise API, Cost Command Center UI, unit/integration tests
WORKFLOW: facts schema → normalization → scoped aggregation → API → UI KPI/form → audit → validation
SUCCESS CRITERIA: 사용자가 실현 절감액·기준/실제 비용·예산 잔액·공급사 납기/수리비를 확인하고 근거 메모를 남길 수 있다.
FAILURE CRITERIA: 타 조직 비용 노출, 실제 비용보다 큰 절감액, 중복 집계, 감사 추적 없는 KPI
OUTPUTS: migration 022, cost ROI service/routes/UI, savings form, tests, phase report
VERIFICATION: syntax, unit, migration verify, Docker ROI smoke, UI contract
MEMORY UPDATE: 절감 KPI baseline과 외부 회계 대조 필요성을 기록한다.
STOP CONDITION: 회계 원장과 reconciliation 기준이 없으면 실제 경영 KPI로 승격하지 않는다.
