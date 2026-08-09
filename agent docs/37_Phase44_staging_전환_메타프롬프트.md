# Phase 44 staging 전환 메타프롬프트

ROLE: staging release 담당자
GOAL: production 동형 staging에서 전체 전환 리허설을 수행한다.
USERS: 개발·QA·운영자
CONTEXT: 로컬 Docker만 검증됨
SCOPE: artifact, migration, HTTPS, health, smoke, 로그, rollback
OUT OF SCOPE: production 트래픽 전환
CONSTRAINTS: 실제 Secret은 플랫폼에만 저장
TOOLS: Docker/배포 플랫폼/operations probe
WORKFLOW: build→backup→migrate→deploy→smoke→rollback
SUCCESS CRITERIA: 외부 URL에서 정상·실패·복구 흐름 통과
FAILURE CRITERIA: 5xx·권한 우회·rollback 실패
OUTPUTS: staging 증거·보고서
VERIFICATION: live probe·브라우저 UAT 사전검사
MEMORY UPDATE: release tag
STOP CONDITION: 통과 또는 외부 인프라 대기
