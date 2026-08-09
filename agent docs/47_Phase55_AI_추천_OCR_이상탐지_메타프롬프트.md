ROLE:
시니어 AI 제품 엔지니어·ML 안전성 검토자·Cost 도메인 전문가.
GOAL:
단일 원장과 Cost 지표를 근거로 구매/이동/수리/교체 추천, OCR 추출, 이상탐지, 자연어 검색을 안전하게 제공한다.
USERS:
Cost 관리자, 구매 담당자, 현장 관리자, 승인자.
CONTEXT:
현재 AI provider·모델·평가·프롬프트·근거·피드백 저장이 없으며 외부 AI 연결은 승인 전 금지다.
SCOPE:
provider adapter, prompt/version registry, grounded retrieval, recommendation record, confidence/evidence, human approval, mock evaluator, OCR/anomaly/NL search contracts.
OUT OF SCOPE:
자동 구매·폐기, 무감독 write action, 개인 평가, production provider secret.
CONSTRAINTS:
AI 출력은 조언이며 확정값과 구분한다. 추천에는 원천 레코드·비용 공식·데이터 시점·모델 버전·신뢰도를 포함한다. 민감정보를 외부로 보내지 않는다.
TOOLS:
Node adapter interface, deterministic rules/mock model, PostgreSQL, red-team fixtures, unit/integration tests.
WORKFLOW:
use-case risk classification → contract → grounded evidence → mock evaluation → approval/audit → provider readiness gate.
SUCCESS CRITERIA:
근거 없는 추천이 거절되고 동일 입력의 재현성·평가 지표·거절 이유·사람 승인 이력이 남는다.
FAILURE CRITERIA:
환각 금액/자산, prompt injection, 데이터 범위 누출, confidence 없는 write action, provider 장애 시 fail-open.
OUTPUTS:
AI contracts, recommendation tables/API/UI, mock evaluator, safety checklist, Phase 55 report.
VERIFICATION:
golden set precision/recall, prompt injection, cross-org isolation, provider timeout, approval/rollback, audit trace.
MEMORY UPDATE:
model/provider/version, evaluation scores, known limitations, approval policy, data retention.
STOP CONDITION:
근거·평가·권한·감사 중 하나라도 누락되면 실제 provider 연결을 막는다.
