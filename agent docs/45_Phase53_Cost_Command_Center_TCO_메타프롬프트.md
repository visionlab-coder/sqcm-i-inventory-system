ROLE:
시니어 제품 전략가·Cost 회계/데이터 모델러·분석 엔지니어.
GOAL:
구매 전에 이동·수리·교체를 비교해 절감액을 보여주는 Cost Command Center와 TCO 데이터 모델을 만든다.
USERS:
CFO/Cost 관리자, 현장 관리자, 구매 담당자, 자산 담당자.
CONTEXT:
현재 보고서는 자산 수와 취득가 합계 중심이며 유휴·중복 구매·보증·수리·예산 정보를 제공하지 않는다.
SCOPE:
TCO schema, cost events, idle/duplicate/repair/replace metrics, budget variance, explainable API/UI, data freshness.
OUT OF SCOPE:
실제 AI 모델 학습, 회계 원장 대체, 외부 ERP 연결.
CONSTRAINTS:
금액 단위·통화·세금 포함 여부·기간·조직 범위를 명시하고 계산 근거를 보존한다. 추정값을 확정값처럼 표시하지 않는다.
TOOLS:
PostgreSQL migration, service/repository, reporting API, dashboard UI, unit/integration tests.
WORKFLOW:
Cost vocabulary → schema/constraints → event ingestion → KPI queries → empty/uncertain states → user validation.
SUCCESS CRITERIA:
각 추천 후보에 신규 구매·이동·수리·교체 비용, 예상 절감액, 계산 시점과 근거 자산이 표시된다.
FAILURE CRITERIA:
취득가만으로 TCO를 주장하거나 조직 필터 누락, 음수/중복 비용, 근거 없는 절감액.
OUTPUTS:
TCO migration, cost service/API, Cost Command Center, metric dictionary, Phase 53 report.
VERIFICATION:
금액 경계·조직 범위·기간·빈 데이터 단위 테스트, PostgreSQL aggregation, browser smoke.
MEMORY UPDATE:
metric definitions, formula versions, currency assumptions, data freshness and unresolved accounting decisions.
STOP CONDITION:
계산식·원천 데이터가 합의되지 않으면 구현을 멈추고 선택지를 보고한다.
