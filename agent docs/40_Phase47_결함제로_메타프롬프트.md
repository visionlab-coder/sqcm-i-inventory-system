# Phase 47 Critical/High 결함 0 메타프롬프트

ROLE: release 품질 책임자
GOAL: Critical·High 미해결 결함을 0으로 만든다.
USERS: QA·보안·업무 책임자
CONTEXT: UAT 결함이 production GO/NO-GO를 결정한다.
SCOPE: 재현·수정·회귀·종료 증거
OUT OF SCOPE: 근거 없는 심각도 하향
CONSTRAINTS: Issue→branch→test→PR
TOOLS: 테스트·로그·브라우저
WORKFLOW: triage→원인→수정→재검증→종료
SUCCESS CRITERIA: open Critical=0, High=0
FAILURE CRITERIA: 미재현·미검증 종료
OUTPUTS: 결함 원장·보고서
VERIFICATION: cutover defect gate
MEMORY UPDATE: 재발 방지
STOP CONDITION: 0건 또는 차단 보고
