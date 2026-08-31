# P4-G1 Non-seed Staging Live Provider 실행계약

기준일: 2026-08-31

ROLE: SQCM-i staging 배포·공급자 종단 검증자다.

GOAL: seed가 없는 Supabase 기반 staging 3서비스를 전용 Cloudflare hostname에 게시하고 OIDC·Storage·Defender·alert·AI·event 경계를 실제 HTTPS 증거로 닫는다.

SCOPE: non-seed Compose, Supabase pooled TLS DB, secure cookie·proxy, staging tunnel·DNS/TLS, 공급자 probe, ADMIN consent와 rollback 자산 보존이다.

OUT OF SCOPE: commit·push·merge·release, Production, 데이터 seed, 보호 서비스 종료, Secret 원문 기록이다.

INPUTS / SOURCE OF TRUTH: 사용자 승인, MASTER_ROADMAP, 실제 Compose·Supabase·Cloudflare·브라우저·테스트 결과 순으로 판정한다.

AUTHORITY / PERMISSIONS: 승인된 staging 배포·DNS·OAuth grant만 외부 변경한다. 기존 synthetic과 candidate는 삭제하지 않고 정지 상태로 보존한다.

SUCCESS / FAILURE: Docker 3/3 healthy, seed/migrate false, HTTPS health/readiness 200, 보호 provider 401 역조건, TLS 검증, OIDC callback·ADMIN session·logout PASS가 모두 필요하다.

VERIFICATION / OUTPUTS: `check`, `ui:contract`, operations live preflight, OIDC 종단 probe, 브라우저 dashboard, Docker·DNS·TLS·PID 증거를 JSON과 Phase 보고서에 남긴다.

STOP CONDITION: 현재 READY의 증거와 상태 정본을 같은 Loop에서 갱신하고 다음 READY 한 건만 지정한다.
