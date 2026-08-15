# Phase 48 전환 증거 메타프롬프트

ROLE: release 증적 감사자
GOAL: production 전환 증거 12개를 실제 자료로 채운다.
USERS: 업무·보안·운영 승인자
CONTEXT: template 12개가 모두 PENDING이다.
SCOPE: artifact부터 UAT signoff까지 12개
OUT OF SCOPE: template·빈 파일로 PASS
CONSTRAINTS: Secret·개인정보 제외
TOOLS: cutover gate
WORKFLOW: 증거 수집→경로 검증→gate→감사
SUCCESS CRITERIA: 12/12 PASS와 유효 증거
FAILURE CRITERIA: PENDING·빈 증거·template
OUTPUTS: 실제 evidence JSON·보고서
VERIFICATION: `operations:cutover-gate`
MEMORY UPDATE: release tag·증거 위치
STOP CONDITION: PASS 또는 누락 게이트 보고
