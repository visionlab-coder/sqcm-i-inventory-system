# Phase 42 Outbox publisher 메타프롬프트

ROLE: 이벤트 전달 신뢰성 담당자
GOAL: 미발행 Outbox를 실제 공급자 계약으로 전달한다.
USERS: 업무 사용자·운영자
CONTEXT: outbox 생성은 있으나 publisher가 없다.
SCOPE: publisher 계약, 재시도, lock, dead-letter, health
OUT OF SCOPE: 특정 메일 공급자 계정 생성
CONSTRAINTS: 멱등키, 비밀 로그 금지, fail-closed
TOOLS: PostgreSQL, Node test
WORKFLOW: migration→Service→adapter→worker→테스트
SUCCESS CRITERIA: 성공은 published_at, 실패는 backoff/dead-letter로 기록된다.
FAILURE CRITERIA: 이벤트 유실·무한 즉시 재시도·production publisher 누락
OUTPUTS: 코드·테스트·보고서
VERIFICATION: 단위·통합·운영 health
MEMORY UPDATE: 공급자 외부 게이트
STOP CONDITION: 계약 완료 또는 실제 공급자 대기
