# P4-G0 Supabase Migration History Adapter 실행계약

기준일: 2026-08-29

ROLE:
SQCM-i application·Supabase migration history 호환성 구현·검증자다.

GOAL:
production backend가 명시 설정에 따라 application checksum history 또는 Supabase provider history의 이름·순서·SQL 본문을 fail-closed로 검증하도록 한다.

SCOPE:
- `DB_MIGRATION_HISTORY_MODE=application|supabase` 명시 설정
- Supabase `sqcmi_*` 24개 이름·순서·SQL 본문 검증 adapter
- 누락·추가·순서·본문 drift 역조건 단위 시험
- PostgreSQL 17·3계층 통합 검증과 실패 증거 기록

OUT OF SCOPE:
- database Secret 조회·연결
- 원격 schema 추가 변경
- 이미 적용된 migration 001~024 수정
- Production 배포·Git 외부 쓰기

WORKFLOW:
1. provider history schema와 실제 statements 계약을 확인한다.
2. 명시 mode와 fail-closed adapter를 구현한다.
3. 단위·구문·실제 provider content digest를 검증한다.
4. 격리 PostgreSQL과 3계층 Compose를 검증한다.
5. 동일 원인이 3회 반복되면 재시도를 중단하고 다중 provider migration target READY를 기록한다.

INPUTS / SOURCE OF TRUTH:
1. local migration 001~024 파일
2. Supabase `supabase_migrations.schema_migrations`
3. 기존 `public.schema_migrations` checksum 계약
4. 실제 단위·Docker·로그 증거

AUTHORITY / PERMISSIONS:
- 읽기: 저장소·provider history·Docker·Harness
- 로컬 쓰기: config·DB adapter·script·test·환경 template·증거 문서
- 임시 실행: 명시 격리 컨테이너·Compose project 생성·제거
- 외부 쓰기: 없음

CONSTRAINTS:
- mode 자동 추정을 금지하고 기본값은 application이다.
- provider history는 이름만 아니라 정규화 SQL 본문까지 비교한다.
- 이미 적용된 migration 파일을 수정하지 않는다.
- 기존 Docker와 보호 서비스를 변경하지 않는다.

SUCCESS CRITERIA:
- Supabase mode가 24개 이름·순서·본문을 일치 판정한다.
- 누락·순서·본문 drift가 모두 실패한다.
- full unit과 3계층 통합이 실패 0으로 통과한다.

FAILURE CRITERIA:
- 이름만 확인하거나 mode를 자동 추정한다.
- 이미 적용된 migration 파일을 변경한다.
- Compose backend 시작 실패 또는 같은 원인 3회 반복
- 임시 자원 잔존·Secret 노출

VERIFICATION / EVIDENCE:
- focused adapter/config unit 12/12
- full unit 131/131
- JavaScript syntax 110
- provider normalized content digest 24/24
- 격리 PostgreSQL·3계층 integration와 backend logs
- Harness·JSON·prompt·diff·Secret scan

OUTPUTS / FORMAT:
- code: `src/db.js`, `src/config.js`, `scripts/db-verify-migrations.mjs`
- tests: `test/unit/db-migration-history.test.js`, `test/unit/config.test.js`
- evidence: `agent docs/harness/P4_G0_SUPABASE_MIGRATION_HISTORY_ADAPTER_EVIDENCE.json`
- report: `docs/phase-reports/103_P4_G0_Supabase_Migration_History_Adapter.md`

STOP CONDITION:
- 3계층까지 PASS하면 Database connection Secret reference Gate로 이동한다.
- 동일 backend 시작 실패가 3회 반복되면 재시도 없이 다중 provider migration target 설계를 다음 READY로 기록하고 중단한다.
