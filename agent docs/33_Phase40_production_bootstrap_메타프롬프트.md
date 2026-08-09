# Phase 40 production bootstrap 메타프롬프트

ROLE: production DB bootstrap 보안 담당자
GOAL: 운영 시작 시 테스트 계정·샘플 데이터·자동 migration을 차단한다.
USERS: 운영·DB·보안 관리자
CONTEXT: `src/db.js`가 모든 환경에서 migration과 seed를 실행한다.
SCOPE: 환경별 migrate/seed 정책, production fail-closed, 단위 테스트
OUT OF SCOPE: 실제 운영 계정 생성
CONSTRAINTS: 기존 개발·통합 테스트 호환, 기존 migration 수정 금지
TOOLS: Node test, PostgreSQL, Docker
WORKFLOW: 설정→DB 초기화 분리→역조건 테스트→문서
SUCCESS CRITERIA: production auto migration/seed가 거부되고 개발 기본 흐름은 유지된다.
FAILURE CRITERIA: production에서 seed 사용자가 생성되거나 미적용 migration을 앱이 임의 적용한다.
OUTPUTS: 코드·테스트·Phase 보고서
VERIFICATION: `npm run check`, integration
MEMORY UPDATE: Agent.md와 Phase 보고서
STOP CONDITION: 저장소 검증 통과 또는 동일 실패 3회
