# P6-G1 무료 PostgreSQL Production 구조 실행계약

기준일: 2026-09-01

ROLE: SQCM-i 비품관리 Production 비용·보안·복구 불변식을 함께 검증하는 코드→운영 Gate 관리자다.

GOAL: Supabase 조직과 staging은 Free 상태로 보존하고, 별도 유료 Supabase Production project 없이 전용 VM의 PostgreSQL 16을 업무 DB·파일 저장소로 사용하며 로컬 인증 MFA를 강제하는 배포 가능 계약을 만든다.

SCOPE:
- application PostgreSQL migration target과 PostgreSQL BLOB 파일 저장 adapter
- Production 로컬 인증의 MFA 필수 fail-closed 정책
- Docker `frontend/backend/database` 3서비스 불변식
- Production env example, deploy precheck, backup·restore·maintenance table 계약
- 로컬 단위·migration·실제 PostgreSQL read/write/delete 검증과 Harness 증거

OUT OF SCOPE:
- Supabase Pro 전환, Production Supabase project 생성, staging 삭제·중지·변경
- Production VM 생성, DNS/TLS 게시, Secret 입력, Production migration·배포
- commit·push·PR·merge·release·원격 CI 실행
- 기존 37봇, AI PC runtime, 보호 포트와 staging 3서비스 변경

INPUTS / SOURCE OF TRUTH:
1. 사용자의 `무료 버전으로 실행하고, 수파베이스 무료가 안되면 포스트그레로 변경` 결정
2. 프로젝트 `AGENTS.md`, `CLAUDE.md`, 장기 Goal+Harness
3. 실제 `compose.yaml`, Production override, config·auth·file service·migration 코드
4. 현재 Supabase Free 조직·staging 상태와 취소된 Pro checkout 증거
5. 로컬 PostgreSQL 16의 격리 검증 결과

WORKFLOW: Inspect → 유료 변경 취소 확인 → Supabase 의존 경계 분석 → PostgreSQL migration·adapter 최소 구현 → MFA fail-closed → 배포·복구 계약 갱신 → 단위·DB·Compose·UI 검증 → Harness 동기화

AUTHORITY / PERMISSIONS:
- allowlist 코드·테스트·문서·Harness 로컬 수정과 비파괴 로컬 검증을 수행한다.
- 격리 검증 DB는 안전한 임시 이름으로 생성하고 검증 후 삭제한다.
- 외부 결제·project·VM·DNS/TLS·Secret·Git·Production 변경은 수행하지 않는다.

SUCCESS CRITERIA:
- Supabase 조직은 Free이며 Pro 결제·Production project·비용 발생이 0이다.
- application migration 25/25와 PostgreSQL 파일 write/read/delete가 실제 DB에서 통과한다.
- Production에서 `FILE_STORAGE_DRIVER=postgres`, `AUTH_PROVIDER=local`, MFA 필수 정책이 fail-closed로 검증된다.
- Compose 서비스가 정확히 3개이고 보호 listener와 staging 서비스가 보존된다.

FAILURE CRITERIA:
- Supabase 유료 변경 또는 staging 중단이 발생한다.
- MFA 미등록 사용자가 Production 세션을 얻거나 local filesystem 저장이 허용된다.
- 파일 BLOB이 backup·restore·maintenance 범위에서 누락되거나 migration 검증이 불일치한다.
- Docker 서비스 또는 보호 포트가 바뀐다.

VERIFICATION / EVIDENCE:
- `npm.cmd run check`
- `npm.cmd run postgres:contract`
- Production 정책값을 사용한 `node scripts/deploy-precheck.mjs`
- `npm.cmd run compose:contract`, `npm.cmd run ui:contract`
- `npm.cmd run harness:status`, `npm.cmd run harness:check`, `npm.cmd run harness:verify`
- Docker staging health와 1234·11434·18765 listener PID 읽기 확인

OUTPUTS / FORMAT:
- `agent docs/harness/P6_G1_FREE_POSTGRES_PRODUCTION_EVIDENCE.json`
- `docs/phase-reports/122_P6_G1_Free_PostgreSQL_Production_Architecture.md`
- `MASTER_ROADMAP.json`, `docs/roadmap.md`, `docs/current-state.md`의 동일 상태

STOP CONDITION:
- 로컬 무료 PostgreSQL 계약이 통과하면 P6-G1의 남은 외부 입력인 전용 VM 공급자·고정 주소·비용, runner, PostgreSQL backup/WAL RPO·RTO를 보고하고 대기한다.
- Production 변경이나 보호 서비스 변화가 발견되면 즉시 중단한다.
