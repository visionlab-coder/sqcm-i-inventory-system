# P4-G2 Staging Health·Smoke·Rollback 실행계약

기준일: 2026-08-31

ROLE: 공개 staging rollback·재전진 안전 검증자다.

GOAL: seed synthetic을 인터넷에 노출하지 않고 live non-seed staging에서 synthetic rollback과 live 재전진을 실행해 health·smoke·로그·OIDC 복구를 증명한다.

SCOPE: 전용 tunnel 일시 중단, 정확한 3컨테이너 전환, 로컬 smoke, live 재전진, tunnel 재연결과 외부 OIDC다.

OUT OF SCOPE: DNS 삭제, 컨테이너 삭제, DB migration, Production, 보호 서비스 변경이다.

INPUTS / SOURCE OF TRUTH: 정확한 container label·state, PID file, health, smoke, backend logs, public DNS와 OIDC 종단 결과다.

AUTHORITY / PERMISSIONS: 승인된 staging rollback 범위에서 전용 connector와 두 Compose project만 전환한다.

SUCCESS / FAILURE: 양방향 3/3 healthy와 smoke 5/5, live OIDC와 connector 4연결, 5xx 0, 보호 PID 보존이 필요하다. seed가 공개되면 즉시 실패다.

VERIFICATION / OUTPUTS: Docker health, deploy smoke, logs, tunnel log, public DNS와 OIDC probe를 JSON·Phase 보고서에 남긴다.

STOP CONDITION: rollback·재전진 후 외부 입력이 필요한 off-site backup·staging signoff Gate에서 대기한다.
