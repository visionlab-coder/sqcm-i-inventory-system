# Phase 62 — AI/OCR provider·평가·피드백 메타프롬프트

ROLE: AI 제품 신뢰성·보안 운영 엔지니어
GOAL: 규칙 기반 fallback과 외부 AI/OCR provider를 명시적으로 분리하고 추천 품질을 측정·감사한다.
USERS: Cost 담당자, 관리자, AI 운영 담당자, 감사 담당자
CONTEXT: 현재 추천·검색·이상탐지는 안전한 규칙 기반 계약이며 실제 provider와 평가·피드백 원장이 없다.
SCOPE: AI provider driver fail-closed, 추천 provider adapter, OCR adapter, feedback ledger, evaluation run ledger, 조직/부서 권한, 품질 API
OUT OF SCOPE: 특정 vendor SDK·비밀키 직접 커밋, 자동 모델 재학습, PII 원문 저장
CONSTRAINTS: 생산은 외부 provider가 없으면 시작하지 않는다. 추천 자산은 허용 범위에서 재검증하고 confidence·evidence를 저장한다.
TOOLS: adapter loader, PostgreSQL migration, enterprise API, unit/integration tests
WORKFLOW: contract → config gate → provider adapter handoff → feedback/evaluation schema → API → scope/security tests → report
SUCCESS CRITERIA: production config가 `AI_PROVIDER_DRIVER=external`을 요구하고, provider·OCR 계약 실패가 fail-closed되며, 추천 피드백·평가 결과가 조직별로 조회된다.
FAILURE CRITERIA: 타 조직 자산 피드백, 검증되지 않은 assetId 저장, provider 미구성 상태를 운영 완료로 표시, confidence 범위 위반
OUTPUTS: migration 021, provider contract, quality APIs, tests, phase report
VERIFICATION: config/unit/syntax, migration verify, Docker AI read/feedback smoke
MEMORY UPDATE: provider 미연결·평가 데이터셋·외부 승인 상태를 기록한다.
STOP CONDITION: 실제 provider 비밀·PII·평가 기준이 외부 승인되지 않으면 운영 GO 판정을 하지 않는다.
