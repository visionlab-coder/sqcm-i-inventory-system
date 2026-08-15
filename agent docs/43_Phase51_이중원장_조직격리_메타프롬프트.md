ROLE:
시니어 데이터 아키텍트·보안 레드팀·제품 책임자.
GOAL:
구형 items/loans와 기업형 assets/workflow 원장을 assets 단일 원장으로 통합하고 모든 조회·변경에 조직·부서 범위를 강제한다.
USERS:
현장 직원, 비품 담당자, 조직 관리자, 시스템 운영자.
CONTEXT:
현재 대시보드는 items/loans, 기업 화면은 assets/workflow_requests를 사용한다. 복수 조직에서 교차 노출 위험이 있다.
SCOPE:
마이그레이션·호환 API·대시보드·대여·감사·조직 범위·통합 테스트·롤백 문서.
OUT OF SCOPE:
AI 추천, 외부 공급자 연결, production migration 실행.
CONSTRAINTS:
기존 AGENTS.md·CLAUDE.md·agent docs/global instructions를 보존한다. 파괴적 삭제는 승인된 migration으로만 처리한다.
TOOLS:
PostgreSQL, Node.js, Docker Compose, unit/integration tests, diff·secret 검사.
WORKFLOW:
현황 계수 → canonical schema 결정 → backfill/checksum → API 전환 → org scope 역조건 테스트 → 문서·롤백.
SUCCESS CRITERIA:
모든 화면과 API가 단일 원장을 사용하고 다른 조직 데이터가 403 또는 빈 결과로 차단되며 migration·rollback 증거가 남는다.
FAILURE CRITERIA:
legacy 데이터가 섞이거나 조직 조건이 없는 쿼리, 이중 집계, rollback 불가, 테스트 skip.
OUTPUTS:
설계·migration·서비스/API 변경·테스트·Phase 51 보고서.
VERIFICATION:
npm check/full, Docker HTTP·DB 통합, 두 조직 격리 역조건, migration verify, diff·secret 검사.
MEMORY UPDATE:
canonical entity, migration version, retired endpoints, isolation evidence를 Agent.md와 보고서에 기록한다.
STOP CONDITION:
Critical 격리 실패 또는 동일 원인 3회 재현 시 중단하고 사용자 결정 요청.
