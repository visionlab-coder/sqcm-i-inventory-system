# P4-G0 전용 Supabase 생성 검증 실행계약

기준일: 2026-08-29

ROLE:
SQCM-i 비품관리 staging 전용 Supabase 자산 검증자다.

GOAL:
사용자가 생성한 `sqcm-i-inventory` 조직과 신규 프로젝트의 소유권·플랜·리전·상태·빈 schema를 읽기 검증하고, 기존 SAFE-LINK와 분리된 다음 migration 사전검토 READY를 확정한다.

SCOPE:
- 신규 조직·프로젝트 metadata 읽기
- `public` table·migration·security/performance advisor 기준선 읽기
- 로컬·synthetic Docker와 보호 listener 보존 확인
- Harness·로드맵·현재 상태·생성 증거 동기화

OUT OF SCOPE:
- 신규 프로젝트 SQL·migration·Auth·Storage·RLS 변경
- API key·database password·service role 조회 또는 기록
- PITR 유료 add-on, DNS/TLS, public tunnel, staging 배포
- 기존 SAFE-LINK 프로젝트 변경
- commit, push, merge, release, Production 변경

WORKFLOW:
1. Harness·Git 기준선을 확인한다.
2. 신규 project ID를 직접 조회해 조직·상태·리전·PostgreSQL 버전을 확인한다.
3. table·migration·advisor가 신규 빈 기준선인지 확인한다.
4. Docker·보호 listener를 확인한다.
5. 기계 증거·사람용 보고·다음 READY를 같은 사실로 갱신한다.

INPUTS / SOURCE OF TRUTH:
1. 사용자의 생성 완료 보고
2. Supabase project·organization API의 실제 응답
3. 프로젝트 Harness·AGENTS.md·CLAUDE.md
4. 실제 Git·Docker·listener 상태

충돌 시 실제 project ID 직접 조회 결과를 우선하며 브라우저 URL만으로 완료 판정하지 않는다.

AUTHORITY / PERMISSIONS:
- 읽기: Supabase metadata·schema·advisor, 저장소, Docker, listener
- 로컬 쓰기: 이 실행계약, 생성 증거·보고, Harness·로드맵·현재 상태
- 외부 쓰기: 없음
- 별도 승인 필요: migration, Secret 사용, Auth·Storage·OIDC 설정, PITR, DNS/TLS

CONSTRAINTS:
- 기존 SAFE-LINK와 신규 inventory 조직·프로젝트를 혼동하지 않는다.
- Secret 원문을 조회·출력·문서화하지 않는다.
- 기존 사용자 변경과 보호 서비스를 보존한다.

SUCCESS CRITERIA:
- 조직명이 `sqcm-i-inventory`, 플랜이 Free로 확인된다.
- 프로젝트 `iuoljosldyymkburagwj`가 `ACTIVE_HEALTHY`로 확인된다.
- 신규 프로젝트의 `public` table과 migration이 각각 0개다.
- security·performance advisor가 각각 0건이다.
- 기존 Docker 3서비스 두 묶음과 보호 listener가 보존된다.
- 다음 READY가 모든 상태 정본에서 일치한다.

FAILURE CRITERIA:
- 신규 조직·project ID를 실제 API로 확인할 수 없다.
- 기존 업무 schema나 migration이 발견된다.
- Secret 노출, 외부 설정 변경, 보호 서비스 변화가 발생한다.

VERIFICATION / EVIDENCE:
- Supabase `get_project`, `get_organization`, `list_tables`, `list_migrations`, `get_advisors`
- `npm.cmd run harness:status`, `npm.cmd run harness:check`
- Docker health와 1234·11434·18765·18766·18767 listener
- prompt contract strict, JSON parse, Secret 패턴, `git diff --check`

OUTPUTS / FORMAT:
- 실행계약: 이 파일
- 기계 증거: `agent docs/harness/P4_G0_SUPABASE_CREATION_EVIDENCE.json`
- 사람용 보고: `docs/phase-reports/98_P4_G0_Dedicated_Supabase_Creation_Verification.md`
- 상태 정본: `agent docs/harness/MASTER_ROADMAP.json`, `docs/roadmap.md`, `docs/current-state.md`

STOP CONDITION:
- 생성 검증과 다음 READY 동기화가 끝나면 이 Loop를 종료한다.
- migration·Secret·유료 기능 Gate에서는 외부 변경 없이 별도 승인 조건을 적용한다.
