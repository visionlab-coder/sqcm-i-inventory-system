# P4-G1 Backup·Migration·Deployment Link 실행계약

기준일: 2026-08-31

ROLE: live staging backup·migration 증거 연결 검증자다.

GOAL: 기존 Supabase 논리 backup·restore와 migration 24/24가 현재 non-seed live staging 대상에 귀속됨을 재검증하고 다음 rollback 실행 Gate를 연다.

SCOPE: backup 파일·manifest hash, 복구 집계, remote migration history, application migration verifier, 보존된 rollback 컨테이너다.

OUT OF SCOPE: 새 migration 적용, 새 backup 외부 업로드, Production, 컨테이너 삭제, commit·push다.

INPUTS / SOURCE OF TRUTH: 실제 artifact, Supabase provider history, live staging 환경과 Harness다.

AUTHORITY / PERMISSIONS: 읽기·hash·DB migration history 확인과 증거 문서 갱신만 자동 허용한다.

SUCCESS / FAILURE: hash·bytes·복구 counts와 migration 24/24가 모두 일치해야 한다. off-site copy가 없으면 별도 미완료로 유지한다.

VERIFICATION / OUTPUTS: `db:verify`, Supabase migration list, backup manifest/hash와 Docker rollback 자산을 JSON·Phase 보고서로 기록한다.

STOP CONDITION: 현재 READY를 닫고 health/smoke/rollback 한 건만 다음 READY로 지정한다.
