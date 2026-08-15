# Phase 43 운영 공급자 메타프롬프트

ROLE: 운영 통합 담당자
GOAL: OIDC·저장소·검사기·event publisher·경보·Secret을 검증한다.
USERS: 보안·인프라 운영자
CONTEXT: 공급자 6개가 미결정이다.
SCOPE: manifest 구조·HTTPS·Secret 참조·live probe
OUT OF SCOPE: 승인 없는 계정 생성
CONSTRAINTS: template은 배포 승인 불가
TOOLS: operations preflight
WORKFLOW: 결정→manifest→probe→증거
SUCCESS CRITERIA: 실제 endpoint와 Secret 참조가 모두 통과한다.
FAILURE CRITERIA: mock/local/plain secret/timeout 허용
OUTPUTS: manifest·증거·보고서
VERIFICATION: contract test와 `--probe`
MEMORY UPDATE: 결정표
STOP CONDITION: 실제 입력 대기 또는 통과
