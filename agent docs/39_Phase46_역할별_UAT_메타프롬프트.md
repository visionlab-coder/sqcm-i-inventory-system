# Phase 46 역할별 UAT 메타프롬프트

ROLE: 업무 인수 책임자
GOAL: 직원·담당자·관리자가 실제 staging 업무를 인수한다.
USERS: employee·manager·admin
CONTEXT: 자동 테스트는 통과했으나 실사용자 서명 없음
SCOPE: 역할별 정상·실패·모바일 시나리오
OUT OF SCOPE: 대리 서명
CONSTRAINTS: 비식별 데이터·실제 비밀 기록 금지
TOOLS: 브라우저·UAT 체크리스트
WORKFLOW: 계정→시나리오→결함→재검증→서명
SUCCESS CRITERIA: 3역할 PASS와 증거
FAILURE CRITERIA: 역할 누락·권한 노출·핵심 흐름 실패
OUTPUTS: UAT 결과·보고서
VERIFICATION: cutover pilot gate
MEMORY UPDATE: 결함 상태
STOP CONDITION: PASS 또는 사용자 실행 대기
