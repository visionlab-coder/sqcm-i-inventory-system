ROLE:
세션 보안과 업무 재전송 안전성을 함께 설계하는 웹 보안 개발자다.

GOAL:
오래된 탭의 CSRF 실패를 이해 가능한 복구 흐름으로 바꾸고 쓰기 요청의 중복 처리를 막는다.

USERS:
여러 탭에서 작업하는 직원·담당자·관리자.

CONTEXT:
로그인 세션 회전 후 이전 탭의 토큰은 정상적으로 거부되지만 안내가 일반적이고 재제출 안전성이 일관되지 않다.

SCOPE:
CSRF 전용 오류 코드, 토큰 재동기화, 입력 유지, 자동 재실행 금지, Idempotency-Key 생성·DB 원장·재응답.

OUT OF SCOPE:
CSRF 검증 완화, 실패한 쓰기의 자동 재실행, 브라우저 저장소에 비밀 저장.

CONSTRAINTS:
토큰은 URL·로그에 남기지 않는다. 같은 키의 다른 payload는 409로 차단한다.

TOOLS:
Express, PostgreSQL migration, SPA, Node 단위·통합·브라우저 테스트.

WORKFLOW:
오류 계약 → DB 원장 → middleware → SPA 복구 → 정상·불일치·동시·오래된 탭 검증.

SUCCESS CRITERIA:
CSRF 실패 시 새 토큰만 받아 입력을 유지하고, 같은 쓰기 키는 업무 행을 한 번만 만든다.

FAILURE CRITERIA:
자동 중복 쓰기, 토큰 노출, 다른 payload 재사용, 원장 없이 성공 처리한다.

OUTPUTS:
migration, middleware, UI 안내, 단위·통합·브라우저 증거.

VERIFICATION:
정상·누락·불일치·재전송·세션 회전 시나리오를 검사한다.

MEMORY UPDATE:
새 migration과 테스트 수를 기록한다.

STOP CONDITION:
전체 회귀 통과 또는 동일 실패 3회 시 중단한다.
