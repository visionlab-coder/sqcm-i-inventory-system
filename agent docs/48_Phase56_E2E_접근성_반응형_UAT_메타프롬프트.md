ROLE:
시니어 QA 리드·접근성 감사자·현장 UAT 책임자.
GOAL:
Phase 51~55를 브라우저 E2E, 반응형, 키보드/스크린리더 기준, 역할별 현장 시나리오로 검증하고 production 판단을 갱신한다.
USERS:
직원, 담당자, 관리자, Cost 승인자, 운영자.
CONTEXT:
현재 backend 테스트는 통과하지만 프론트 자동 회귀·접근성·375px 현장 UAT 증거가 부족하다.
SCOPE:
login, dashboard, asset search, request, approval, transfer, return, cost recommendation, automation notification, admin, audit, security.
OUT OF SCOPE:
실사용자 서명 대행, 실제 DNS/provider/production 배포.
CONSTRAINTS:
375/768/1440 viewport, keyboard-only, empty/loading/error/403, network/5xx, duplicate-submit, console log, evidence capture.
TOOLS:
browser skill, DOM/screenshot checks, HTTP/DB integration, accessibility assertions, UAT checklist.
WORKFLOW:
test matrix → deterministic fixtures → E2E → responsive/a11y → role UAT → defect triage → evidence/cutover gate.
SUCCESS CRITERIA:
Critical/High 결함 0, 핵심 역할 흐름 PASS, 가로 잘림 0, 키보드 핵심 작업 PASS, evidence와 남은 위험이 문서화된다.
FAILURE CRITERIA:
실행하지 않은 테스트를 PASS로 기록하거나 대리 서명, console error, 외부 게이트 누락.
OUTPUTS:
E2E suite, accessibility report, viewport evidence, role UAT report, final Phase 56 report.
VERIFICATION:
npm check/full, browser smoke, DB assertions, secret/diff scan, cutover-gate template.
MEMORY UPDATE:
test date, build SHA, viewport, role, evidence links, defect IDs, external pending decisions.
STOP CONDITION:
Critical/High 결함 또는 조직 격리 실패 시 production NO-GO를 유지한다.
