# P4-G0 Supabase RLS·Privilege Migration 설계 실행계약

기준일: 2026-08-29

ROLE:
SQCM-i 비품관리 Supabase Data API 최소권한 migration 설계·검증자다.

GOAL:
기존 backend의 직접 PostgreSQL owner 연결을 보존하면서 Supabase `public` schema의 `anon`·`authenticated` 접근을 기본 거부하는 forward-only migration 023을 설계하고 PostgreSQL 17에서 검증한다.

SCOPE:
- `023_supabase_data_api_lockdown.sql` 신규 forward-only migration
- 모든 `public` base table RLS 활성화
- Supabase Data API 역할 `anon`·`authenticated`·`service_role`의 schema·table·sequence·function 권한 회수
- PUBLIC function RPC·schema 사용 기본 권한 회수
- 단위 계약, PostgreSQL 17 격리 적용·검증, backend owner 업무 왕복
- Harness·로드맵·현재 상태·증거 동기화

OUT OF SCOPE:
- Supabase project `iuoljosldyymkburagwj` 원격 migration 적용
- table 삭제·column 삭제·data rewrite·RLS policy 생성
- API key·database password·service role 조회·생성·기록
- 기존 Docker 서비스·보호 listener 변경

WORKFLOW:
1. Harness 계약과 기존 function·trigger·migration runner를 점검한다.
2. owner bypass를 보존하고 Data API만 fail-closed하는 migration 023을 작성한다.
3. 정적 단위 계약과 JavaScript 구문 검사를 수행한다.
4. `anon`·`authenticated` 역할이 있는 임시 PostgreSQL 17에서 23개 migration을 적용·검증한다.
5. RLS 수, policy 수, 역할 권한, owner 업무 왕복을 검증한다.
6. 임시 컨테이너를 제거하고 증거와 다음 승인 Gate를 동기화한다.

INPUTS / SOURCE OF TRUTH:
1. `db/migrations/001_init.sql`부터 `022_cost_roi_savings.sql`
2. `src/db.js` migration·checksum 계약
3. Supabase Data API의 `public` schema·RLS·database role 모델
4. 실제 PostgreSQL 17 실행 결과

AUTHORITY / PERMISSIONS:
- 읽기: 저장소, migration, Harness, Docker·listener, Supabase 빈 기준선
- 로컬 쓰기: migration 023, 관련 테스트, Agent Docs·Harness·Phase 보고
- 임시 실행: 명시 이름의 격리 PostgreSQL 17 컨테이너 생성·제거
- 명시 승인 필요: 전용 Supabase 원격 migration 적용과 Secret 사용

CONSTRAINTS:
- `FORCE ROW LEVEL SECURITY`를 사용하지 않아 backend owner의 직접 DB 연결을 유지한다.
- Data API에 application policy를 만들지 않고 schema·object privilege와 RLS로 기본 거부한다.
- Supabase 역할이 없는 일반 PostgreSQL에서도 migration이 통과해야 한다.
- 임시 Secret은 출력·파일 기록하지 않으며 기존 컨테이너와 volume을 변경하지 않는다.

SUCCESS CRITERIA:
- migration 적용·checksum 검증이 23/23 통과한다.
- public base table 53/53에서 RLS가 활성화되고 policy는 0개다.
- `anon`·`authenticated`·`service_role`의 public schema USAGE와 table SELECT가 모두 0이다.
- backend owner 업무 왕복 통합 시험이 통과한다.
- 단위 125/125, 구문 108, Harness 오류 0이며 임시 컨테이너가 제거된다.

FAILURE CRITERIA:
- Data API 역할이 application table 또는 RPC에 접근할 수 있다.
- owner backend 업무 흐름이 RLS 때문에 실패한다.
- migration이 Supabase 역할 부재 환경에서 실패한다.
- 원격 migration·Secret 사용 또는 보호 서비스 변화가 발생한다.

VERIFICATION / EVIDENCE:
- `node --test test/unit/supabase-data-api-lockdown.test.js test/unit/migration-checksum.test.js`
- `npm.cmd run check:syntax`, `npm.cmd run test:unit`
- 격리 PostgreSQL 17 `npm.cmd run db:migrate`, `npm.cmd run db:verify`
- 격리 backend owner `test/integration/inventory-db.test.js`
- RLS·policy·schema/table privilege SQL assertion
- Supabase project/table/migration 읽기 재확인, listener·Docker 상태
- prompt strict, JSON parse, Harness check, Secret scan, `git diff --check`

OUTPUTS / FORMAT:
- migration: `db/migrations/023_supabase_data_api_lockdown.sql`
- 단위 계약: `test/unit/supabase-data-api-lockdown.test.js`
- 실행계약: 이 파일
- 기계 증거: `agent docs/harness/P4_G0_SUPABASE_RLS_MIGRATION_EVIDENCE.json`
- 사람용 보고: `docs/phase-reports/100_P4_G0_Supabase_RLS_Privilege_Migration_Design.md`
- 상태 정본: Harness, roadmap, current-state

STOP CONDITION:
- 설계와 로컬 검증 증거가 PASS이면 원격 적용을 실행하지 않고 정확한 project·migration·영향을 제시하는 명시 승인 Gate에서 중단한다.
- 보호 서비스 변화 또는 같은 원인 3회 실패 시 즉시 중단한다.
