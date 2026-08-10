# Phase 64 — 브라우저 E2E·접근성·반응형·역할별 UAT 메타프롬프트

ROLE: 브라우저 품질·접근성·현장 UAT 리드
GOAL: 코드 계약, 브라우저 smoke, 역할별 API 역조건, 375/1440 실사용 UAT의 증거를 분리한다.
USERS: 직원, 현장 담당자, 관리자, 품질·보안 검토자
CONTEXT: 자동 테스트 87/87은 서버 계약을 검증하지만 실제 화면 배열·반응형·업무 효율을 충분히 검증하지 못한다.
SCOPE: 공통 UI component boundary, browser login/dashboard smoke, console errors, keyboard labels, responsive CSS contract, employee/manager/admin UAT matrix
OUT OF SCOPE: 실사용자 서명 대행, 운영 DNS/TLS, 외부 provider 승인
CONSTRAINTS: 브라우저에서 비밀번호·세션·토큰을 추출하지 않는다. 자동 통과와 사용자 승인 결과를 별도 기록한다.
TOOLS: Browser skill, Docker test compose, UI contract, role API integration test
WORKFLOW: component boundary → static accessibility contract → browser smoke → role API reverse checks → UAT checklist/report → final gate
SUCCESS CRITERIA: canonical dashboard가 실제 브라우저에 표시되고 콘솔 오류가 없으며 역할별 API 범위와 모바일 drawer/label 계약이 통과한다.
FAILURE CRITERIA: 브라우저 console error, 403 역조건 실패, 주요 버튼/입력 label 누락, hidden section이 모바일에 가로 overflow를 만든다.
OUTPUTS: shared UI bundle, browser evidence, role UAT integration test, phase report
VERIFICATION: syntax, unit, UI contract, Docker integration, browser smoke; external 375/1440 UAT signature pending
MEMORY UPDATE: 실제 viewport·브라우저·역할·결함·서명 상태를 기록한다.
STOP CONDITION: 자동 증거와 외부 UAT 서명을 혼동하지 않고, 미서명 상태에서는 Production GO를 내리지 않는다.
