# Phase 61 — 관리자 정보구조·구매 워크플로 분리 메타프롬프트

ROLE: 엔터프라이즈 UX·워크플로 엔지니어
GOAL: 관리자와 구매 담당자가 한 화면에서 서로 다른 책임을 동시에 처리하지 않도록 작업 공간을 단계별로 분리한다.
USERS: 시스템 관리자, 구매 담당자, 승인자, 요청자
CONTEXT: 관리자 페이지와 요청함에 조직·초대·기준정보·승인·발주·입고·검수가 한 화면에 누적되어 데스크톱에서도 잘리고 감사 사유가 고정되어 있다.
SCOPE: 관리자 탭(조직·승인정책·기준정보·사용자·이벤트), 요청함 탭(요청 작성·승인 큐·발주/입고/검수), 입력 가능한 승인·반려 사유, 기존 API·권한 유지
OUT OF SCOPE: 승인 정책의 DB 모델 교체, 새로운 구매 회계 시스템 연동, 운영 배포
CONSTRAINTS: SoD·조직/부서 범위·CSRF·멱등성·감사 로그를 약화하지 않는다. 숨김은 권한 대체가 아니다.
TOOLS: 기존 SPA, enterprise workflow API, CSS responsive layout, unit/UI/integration tests
WORKFLOW: 정보구조 정의 → 탭/단계 패널 구현 → 사유 입력 검증 → 375/1440 레이아웃 계약 → 권한 회귀 검증 → 보고서
SUCCESS CRITERIA: 관리자와 구매 화면에서 한 번에 하나의 책임 영역만 보이고, 승인·반려 시 사용자가 입력한 사유가 API·감사 원장에 전달된다.
FAILURE CRITERIA: 다른 역할 데이터 노출, 고정 사유 전송, 기존 승인 상태 전이 우회, 모바일 가로 넘침
OUTPUTS: section tabs, workflow tabs, editable review reason, responsive styles, phase report
VERIFICATION: syntax, unit, UI contract, Docker integration, role/UAT checklist
MEMORY UPDATE: 화면별 책임과 실제 UAT 미완료 상태를 기록한다.
STOP CONDITION: 승인 사유가 감사 원장에 저장되지 않거나 권한 역조건이 깨지면 중단한다.
