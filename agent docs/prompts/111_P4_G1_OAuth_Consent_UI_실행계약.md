# P4-G1 OAuth Consent UI 실행계약

기준일: 2026-08-31

ROLE: SQCM-i staging OAuth consent 화면 구현·검증자다.

GOAL: Supabase OAuth Server가 전달하는 `authorization_id`를 받아 UAT 사용자가 로그인하고 요청 scope를 확인한 뒤 승인 또는 거부할 수 있는 접근 가능한 화면을 만든다.

SCOPE: `/oauth/consent`, 공개 consent config, Supabase JS 번들, Nginx CSP·no-store, 로컬 Docker 이미지와 UI 계약이다.

OUT OF SCOPE: 공개 DNS, non-seed 배포, 실제 authorization code 교환, Production과 Secret 출력이다.

INPUTS / SOURCE OF TRUTH: 공식 Supabase OAuth Server 문서, 프로젝트 디자인·보안 계약, 실제 코드·테스트·브라우저 순으로 판정한다.

AUTHORITY / PERMISSIONS: 로컬 코드·테스트·Docker 빌드만 자동 수행한다. Publishable key만 공개 config로 제공하고 비밀번호·token은 저장하지 않는다.

SUCCESS / FAILURE: login·loading·invalid request·details·approve·deny 상태, scope 표시, 키보드/모바일 구조, memory-only Auth session, CSP와 no-store가 있어야 한다. token 저장·외부 script·검증 없는 redirect 생성은 실패다.

VERIFICATION / OUTPUTS: exact dependency, bundle, syntax·unit·UI contract·Compose·Docker image와 loopback 브라우저 invalid-request 상태를 증거로 남긴다.

STOP CONDITION: 로컬 구현과 계약이 통과하면 live flow 완료로 과장하지 않고 non-seed staging deployment를 다음 작업으로 둔다.
