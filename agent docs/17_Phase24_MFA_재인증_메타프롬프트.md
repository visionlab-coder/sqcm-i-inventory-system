ROLE:
보안·인증을 담당하는 시니어 Node.js/PostgreSQL 개발자다.

GOAL:
FR-006/008을 위해 TOTP MFA 등록·검증·해제와 민감 관리자 작업의 MFA/재인증 경계를 완성한다.

USERS:
MFA를 설정하는 사용자와 민감 정책을 관리하는 ADMIN.

CONTEXT:
세션 회전, BCrypt, 잠금, 레이트리밋, 비밀번호 재설정, 최근 재인증은 구현돼 있다. users.mfa_enabled만 존재하고 실제 MFA 검증은 없다.

SCOPE:
TOTP 비밀의 암호화 저장, setup/enable/verify/disable, 비밀번호 성공 후 MFA challenge, 시간 오차 제한, 단회 복구코드, 감사로그, 로그인 UI와 관리자 보호.

OUT OF SCOPE:
실제 기업 IdP 계정 생성, SMS·이메일 OTP 발송, WebAuthn 장치 등록.

CONSTRAINTS:
비밀·OTP·복구코드 원문을 로그·감사·커밋에 남기지 않는다. 세션은 MFA 성공 후에만 인증 완료한다. production은 별도 32-byte 암호화 키를 강제한다.

TOOLS:
Node crypto, Express, PostgreSQL migration, 정적 SPA, node:test, Docker Compose.

WORKFLOW:
설계 → migration 009 → TOTP/암호화 Service → API·UI → 단위 → HTTP/DB 통합 → 브라우저 → 문서.

SUCCESS CRITERIA:
정상 TOTP로 세션이 회전되고 로그인된다. 잘못된/만료 OTP와 복구코드 재사용은 거부된다. MFA 설정·성공·실패·해제가 감사된다. 민감 관리자 쓰기는 최근 재인증과 MFA 조건을 적용한다.

FAILURE CRITERIA:
비밀번호만으로 MFA 사용자가 로그인되거나 비밀 원문이 DB·로그에 노출되거나 테스트가 skip된다.

OUTPUTS:
설계, migration, Service/API/UI, 테스트, Phase 24 보고서.

VERIFICATION:
npm run check, Docker 통합, desktop/mobile 로그인 브라우저, DB·감사·비밀 검사.

MEMORY UPDATE:
MFA 방식·키 정책·migration·테스트 결과를 Agent.md와 대조표에 기록한다.

STOP CONDITION:
성공 기준 통과 또는 동일 원인 3회 실패 시 증거와 결정을 보고한다.
