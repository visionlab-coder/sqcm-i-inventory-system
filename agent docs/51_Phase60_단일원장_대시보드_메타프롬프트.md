# Phase 60 — 단일 자산 원장 대시보드 전환 메타프롬프트

ROLE: 시니어 제품화·데이터 무결성 엔지니어
GOAL: 대시보드와 모든 사용자 진입점을 기업 `assets` 원장으로 통일한다.
USERS: 현장 직원, 담당자, 관리자
CONTEXT: 기존 구형 `items/loans` API와 기업 `assets/workflow_requests` 원장이 공존해 화면 숫자가 달라질 수 있다.
SCOPE: canonical dashboard read model, 조직·부서 범위, 최근 자산, 승인 대기, 레거시 UI alias 제거, UI contract 및 통합 smoke
OUT OF SCOPE: 레거시 API 즉시 삭제, 운영 DB 파괴적 마이그레이션, DNS/외부 배포
CONSTRAINTS: AGENTS.md·CLAUDE.md·기존 문서 보존, SQL은 Repository/Service 계층에만 작성, 권한은 API와 데이터 범위에서 재검사
TOOLS: Node.js, PostgreSQL, npm test, Docker integration
WORKFLOW: read model 설계 → endpoint 구현 → 대시보드 전환 → 레거시 UI 호출 제거 → 단위·통합·UI 계약 검증 → 보고서 기록
SUCCESS CRITERIA: 대시보드가 `/api/enterprise/dashboard`만 호출하고, 응답의 자산 수·상태·승인 대기가 조직/부서 범위와 일치하며, 레거시 `/api/dashboard|items|loans` UI 호출이 0건이다.
FAILURE CRITERIA: 권한 없는 조직 데이터 노출, 구형 API 호출 잔존, 자산 목록과 대시보드 수치 불일치, 테스트 실패
OUTPUTS: canonical dashboard endpoint, 화면 전환, UI contract, integration smoke, phase report
VERIFICATION: syntax, unit, UI contract, Docker integration, migration verification
MEMORY UPDATE: Phase 60 보고서와 현재 레거시 호환 API의 deprecation 상태를 기록한다.
STOP CONDITION: 통합 원장 수치·권한 범위가 재현되지 않으면 구현을 중단하고 원인 계층을 기록한다.
