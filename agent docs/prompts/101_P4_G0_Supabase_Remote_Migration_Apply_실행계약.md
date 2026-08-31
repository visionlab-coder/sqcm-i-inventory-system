# P4-G0 Supabase 원격 Migration 적용 실행계약

기준일: 2026-08-29

ROLE:
SQCM-i 비품관리 전용 Supabase staging DB migration 실행·검증자다.

GOAL:
사용자가 생성하고 현재 명령으로 진행을 승인한 전용 project `iuoljosldyymkburagwj`의 빈 DB에 검증된 migration 001~023을 순차 적용하고, schema·RLS·privilege·advisor 증거로 적용 결과를 판정한다.

SCOPE:
- 대상: Supabase project `iuoljosldyymkburagwj`, PostgreSQL 17, Singapore
- `db/migrations/001_init.sql`부터 `023_supabase_data_api_lockdown.sql` 순차 적용
- migration history, public table, RLS, policy, Data API 역할 권한 검증
- security·performance advisor 읽기 검증
- 체크리스트·Harness·로드맵·현재 상태·Phase 보고 동기화

OUT OF SCOPE:
- 기존 SAFE-LINK project `wzmzpuxpcpuvuacwmslj` 변경
- seed·실제 업무 데이터·Auth 사용자·Storage bucket 생성
- database password·API key·service role key 조회 또는 기록
- 애플리케이션 배포, DNS/TLS, PITR, OIDC, 결제, Production 전환
- Git commit·push·merge·release

WORKFLOW:
1. Harness와 대상 project가 ACTIVE_HEALTHY, public table 0, migration 0인지 재확인한다.
2. migration 001부터 023까지 한 건씩 순서대로 적용한다.
3. 한 건이라도 실패하면 즉시 중단하고 같은 migration을 자동 재시도하지 않는다.
4. 23건 적용 후 migration 수·table 수·RLS·policy·역할 권한을 읽기 검증한다.
5. security·performance advisor를 조회해 ERROR·WARN을 판정한다.
6. 보호 서비스·Docker 상태를 재확인하고 증거·다음 READY를 동기화한다.

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자의 무개입 진행 명령과 직전의 정확한 대상·행위 승인 Gate
2. 프로젝트 AGENTS.md·CLAUDE.md·Harness
3. `db/migrations/001`~`023` 실제 파일
4. Supabase 공식 Data API·RLS·default privilege 문서
5. Supabase MCP의 실제 project·migration·SQL·advisor 결과

AUTHORITY / PERMISSIONS:
- 읽기: 저장소, Harness, Supabase 대상 project metadata/schema/advisor, 로컬 Docker·listener
- 로컬 쓰기: 이 계약과 관련 evidence·Phase 보고·Harness·roadmap·current-state
- 외부 쓰기: project `iuoljosldyymkburagwj`에 migration 001~023 적용만 승인됨
- 승인되지 않음: 다른 project, seed/data, Secret, Auth/Storage, 배포, DNS/TLS, Production, Git 외부 쓰기

CONSTRAINTS:
- migration 파일과 순서를 변경하지 않고 각 적용 결과를 확인한다.
- 실패한 migration 이후 항목은 실행하지 않는다.
- 기존 dirty worktree와 보호 서비스·Docker 3서비스 불변식을 보존한다.
- Secret·토큰·connection string 원문은 조회·로그·문서에 기록하지 않는다.
- 적용 후 application table이 52개가 아니거나 RLS가 52/52가 아니면 다음 Gate로 이동하지 않는다. 로컬의 53번째 `public.schema_migrations`는 Supabase provider history로 대체되는 차이를 별도 판정한다.

SUCCESS CRITERIA:
- Supabase migration history가 23건이며 001~023 순서가 확인된다.
- public application base table이 52개이고 52/52 RLS enabled다.
- policy 0은 Data API 전체 차단 설계와 일치한다.
- `anon`·`authenticated`·`service_role`의 public schema USAGE와 table SELECT 가능 수가 0이다.
- security advisor ERROR 0, 보호 listener와 기존 Docker 서비스가 보존된다.

FAILURE CRITERIA:
- migration 일부 실패 또는 순서·수 불일치
- RLS 누락, Data API 역할 권한 잔존, SECURITY DEFINER 노출
- advisor ERROR 또는 Secret 노출
- 대상 project가 다르거나 기존 서비스가 변경됨

VERIFICATION / EVIDENCE:
- Supabase `get_project`, `list_tables`, `list_migrations`
- Supabase SQL count·RLS·policy·role privilege assertion
- Supabase security·performance advisor
- `npm.cmd run harness:status`, `harness:check`
- JSON parse, prompt strict, Secret pattern scan, `git diff --check`
- `Get-NetTCPConnection`, `docker ps`

OUTPUTS / FORMAT:
- 실행계약: 이 파일
- 기계 증거: `agent docs/harness/P4_G0_SUPABASE_REMOTE_MIGRATION_EVIDENCE.json`
- 사람용 보고: `docs/phase-reports/101_P4_G0_Supabase_Remote_Migration_Apply.md`
- 체크리스트와 시각화: `docs/roadmap.md`
- 상태 정본: `agent docs/harness/MASTER_ROADMAP.json`, `docs/current-state.md`

STOP CONDITION:
- 원격 적용과 검증이 PASS하면 상태 정본을 동기화하고 다음 READY 한 건을 판정한다.
- migration 실패, advisor ERROR, 보호 서비스 변화 또는 같은 원인 3회 실패 시 즉시 중단한다.
- 새 Secret·계정·결제·Production 대상이 필요한 READY에서는 해당 외부 변경을 실행하지 않는다.
