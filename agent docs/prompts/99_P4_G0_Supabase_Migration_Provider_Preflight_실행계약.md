# P4-G0 Supabase Migration·Provider 사전검토 실행계약

기준일: 2026-08-29

ROLE:
SQCM-i 비품관리 Supabase migration·provider 계약 사전검토자다.

GOAL:
로컬 migration 22개의 순서·checksum·PostgreSQL 17 적용 가능성과 Supabase RLS·권한·Secret reference 공백을 원격 쓰기 없이 판정한다.

SCOPE:
- migration 22개 파일·순서·SHA-256·위험 SQL 정적 감사
- 임시 PostgreSQL 17에 22개 migration 적용·checksum 검증
- 생성 table·RLS·policy 수 확인
- production 환경변수와 operations manifest Secret reference 계약 점검
- Harness·로드맵·현재 상태·증거 보고 동기화

OUT OF SCOPE:
- Supabase project `iuoljosldyymkburagwj`에 SQL·migration 적용
- API key·database password·service role 조회·생성·기록
- 실제 Secret Manager·Storage bucket·OIDC client·PITR 생성
- 기존 Docker project·SAFE-LINK 프로젝트 변경

WORKFLOW:
1. Harness·migration 파일 목록과 checksum을 확인한다.
2. DROP·TRUNCATE·SECURITY DEFINER·RLS·policy·function·trigger 위험 표면을 검사한다.
3. 임시 PostgreSQL 17 컨테이너에 migration을 적용하고 즉시 검증한다.
4. table·RLS·policy 수와 Secret reference 계약을 판정한다.
5. 임시 컨테이너를 제거하고 증거·다음 READY를 동기화한다.

INPUTS / SOURCE OF TRUTH:
1. `db/migrations/001_init.sql`부터 `022_cost_roi_savings.sql`
2. `src/db.js`, `src/config.js`, `.env.production.example`
3. `config/operations.manifest.example.json`
4. 실제 PostgreSQL 17 실행 결과와 Supabase 보안 원칙

AUTHORITY / PERMISSIONS:
- 읽기: 저장소, migration, 구성, Harness, Docker 상태
- 로컬 쓰기: 임시 PostgreSQL 17 컨테이너와 이 증거·보고·상태 문서
- 외부 쓰기: 없음
- 명시 승인 필요: Supabase migration, Secret 사용, provider 설정

CONSTRAINTS:
- 임시 컨테이너 이름은 `seowon-inventory-pg17-preflight`로 제한하고 종료 시 제거한다.
- 기존 Docker project·volume·listener를 변경하지 않는다.
- Secret 값은 임시 난수로만 생성하고 출력·파일 기록하지 않는다.

SUCCESS CRITERIA:
- migration 파일이 정확히 22개이며 checksum과 순서가 기록된다.
- PostgreSQL 17에서 migration 적용·검증이 22/22 통과한다.
- 생성된 public table·RLS·policy 수가 기록된다.
- Supabase 원격 적용 가능 여부가 fail-closed로 판정된다.
- 임시 컨테이너가 제거되고 보호 서비스가 유지된다.

FAILURE CRITERIA:
- migration 적용·checksum 검증 실패
- RLS·권한 공백을 무시하고 원격 적용 승인
- 임시 컨테이너 잔존 또는 기존 Docker 영향
- Secret 원문 노출

VERIFICATION / EVIDENCE:
- `npm.cmd run db:migrate`, `npm.cmd run db:verify`
- PostgreSQL 17 schema/RLS/policy count query
- migration checksum unit 2/2
- SQL 위험 패턴·환경변수·Secret reference 정적 감사
- Harness check, JSON parse, prompt contract strict, `git diff --check`

OUTPUTS / FORMAT:
- 실행계약: 이 파일
- 기계 증거: `agent docs/harness/P4_G0_SUPABASE_MIGRATION_PREFLIGHT_EVIDENCE.json`
- 사람용 보고: `docs/phase-reports/99_P4_G0_Supabase_Migration_Provider_Preflight.md`
- 상태 정본: Harness, roadmap, current-state

STOP CONDITION:
- 원격 migration 판정과 다음 READY가 증거로 동기화되면 종료한다.
- RLS·권한 또는 실제 Secret reference가 없으면 원격 migration을 실행하지 않는다.
