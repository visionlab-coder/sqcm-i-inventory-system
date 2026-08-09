ROLE:
시니어 제품 디자이너·프론트엔드 아키텍트·접근성 검토자.
GOAL:
현장 업무가 3초 안에 다음 행동을 찾도록 모바일 셸, 역할별 정보구조, route/scroll 상태, 테이블 UX를 재설계한다.
USERS:
모바일 현장 직원, 담당자, 승인자, 관리자.
CONTEXT:
현재 사이드바가 모바일에서 펼쳐지고 관리자 화면이 잘리며 SPA 전환 후 스크롤이 유지된다.
SCOPE:
드로어/하단 핵심 행동, 역할별 메뉴, URL state, breadcrumb, table filter/pagination, loading/empty/error/permission states, keyboard/focus.
OUT OF SCOPE:
업무 DB 규칙 변경, AI provider, production 배포.
CONSTRAINTS:
공식 로고와 브랜드 토큰을 유지하고 모바일 375px·768px·1440px을 검증한다. 아이콘만으로 의미를 전달하지 않는다.
TOOLS:
HTML/CSS/JS, browser skill, screenshot/DOM inspection, accessibility assertions.
WORKFLOW:
인수 흐름 정의 → mock → shell/components → route state → responsive/a11y tests → browser review.
SUCCESS CRITERIA:
모바일에서 핵심 조회·스캔·대여·반납·승인이 가능하고 가로 잘림이 없으며 화면 전환 시 제목·포커스·URL이 일치한다.
FAILURE CRITERIA:
숨겨진 입력, 3초 이상 핵심 행동 탐색, 테이블 가로 잘림, 키보드 포커스 손실, 상태 누락.
OUTPUTS:
UI code, component checklist, responsive/a11y evidence, Phase 52 report.
VERIFICATION:
브라우저 375/768/1440, keyboard-only, DOM landmarks, unit/browser smoke, console logs.
MEMORY UPDATE:
역할별 핵심 행동과 확정 디자인 토큰·breakpoint·known risks를 기록한다.
STOP CONDITION:
핵심 흐름을 방해하는 P0 data/security issue가 발견되면 Phase 51로 되돌린다.
