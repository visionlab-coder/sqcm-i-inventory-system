# P5-G1 Storage Driver Remediation 실행계약

기준일: 2026-08-31

ROLE: staging migration·배포·UAT 복구 실행자다.

GOAL: 열린 High `P5-DEFECT-001`의 `SUPABASE_S3` storage driver 제약 불일치를 forward-only migration으로 보완하고, staging 재배포·UAT 재실행 증거로 결함을 닫는다.

SCOPE: migration 025와 target manifest, 관련 단위·통합 검증, 전용 Supabase staging migration, backend 재배포, health/smoke·rollback 호환성, P5 UAT 재실행과 증거 동기화다.

OUT OF SCOPE: 기존 migration 수정, Production, commit·push·merge·release, 실제 업무데이터, DNS/TLS·계정·Secret 변경이다.

WORKFLOW: Harness 검사 → pre-change backup → live 제약 확인 → forward migration 작성 → 로컬 회귀 → staging migration → backend 재배포 → health/smoke·로그 → UAT 재실행 → 증거·Harness 동기화다.

INPUTS / SOURCE OF TRUTH: 사용자 승인, migration 008·target manifest, live PostgreSQL 제약·migration history, `P5-DEFECT-001`, 코드·테스트·Docker·HTTPS 실제 결과다.

AUTHORITY / PERMISSIONS: 승인 대상은 프로젝트 `iuoljosldyymkburagwj` staging의 migration 025 적용과 `seowon-inventory-staging` backend 재배포다. 로컬 allowlist는 migration·manifest·관련 테스트·실행기·P5 증거 문서다.

CONSTRAINTS: 적용된 001~024를 수정하지 않는다. CA 검증·Secret 비출력·Docker 3서비스·보호 listener를 유지한다. migration rollback은 기존 허용값과 신규 값의 데이터 호환성을 확인한다.

SUCCESS CRITERIA: migration history 25/25, 제약 허용값 3개, 정상 PNG 201·download 일치, UAT 19 PASS·Critical/High 0, health/readiness 200, Docker 3/3 healthy와 보호 PID 보존이다.

FAILURE CRITERIA: migration mismatch, 정상 업로드 500, 데이터·인증·권한 회귀, 열린 Critical/High, health·Docker·보호 서비스 변화다. 같은 원인이 3회면 중단한다.

VERIFICATION / EVIDENCE: migration 단위·application/Supabase 이력 검사, 관련 통합 테스트, staging SQL readback, HTTPS health/readiness, provider receipt, backend logs, Harness status/check/verify를 사용한다.

OUTPUTS / FORMAT: migration·테스트, 백업 SHA-256, 기계 JSON, Phase 보고서·체크리스트·로드맵을 동일 사실로 기록하고 Secret·이메일·토큰 원문을 제외한다.

STOP CONDITION: 19개 기술 UAT가 모두 실제 PASS하면 P5-G2 서명 Gate에서 중단한다. 브라우저 자격증명 전송 확인 또는 새 High 결함이 필요하면 G1을 유지한다.
