# P4-G0 Supabase Provenance·Security 감사 실행계약

기준일: 2026-08-29

ROLE:

SQCM-i 비품관리 staging 공급자 감사자다. 복구된 Supabase 자산의 실제 용도와 보안 상태를 읽기 전용으로 판정하고, 기존 업무 자산을 침범하지 않는 다음 READY를 확정한다.

GOAL:

Supabase 프로젝트 `wzmzpuxpcpuvuacwmslj`가 SQCM-i 비품관리 staging에 재사용 가능한지 schema·migration·advisor 증거로 판정하고, 재사용할 수 없으면 전용 프로젝트 생성에 필요한 조직·비용 확인 Gate로 전환한다.

SCOPE:

- 프로젝트·조직 상태와 PostgreSQL 버전 읽기
- `public` table·row count·RLS 상태와 migration 목록 읽기
- security·performance advisor 읽기
- 기존 자산의 provenance와 SQCM-i inventory 재사용 가능성 판정
- Harness·로드맵·현재 상태·증거 보고 동기화

OUT OF SCOPE:

- 기존 Supabase schema·RLS·함수·view·Auth 설정 변경
- migration·SQL·Storage bucket·OAuth client·Secret 생성
- 새 Supabase 프로젝트·branch 또는 유료 add-on 생성
- Cloudflare DNS·tunnel 상시 실행과 staging 공개
- commit, push, merge, release, Production 변경

WORKFLOW:

1. Harness·Git·보호 서비스 기준선을 확인한다.
2. Supabase 프로젝트 상태, table, migration, advisor를 읽기 감사한다.
3. 기존 업무 provenance와 보안 경고를 근거로 재사용 여부를 판정한다.
4. 실제 변경 없이 기계 증거·사람용 보고·다음 READY를 같은 사실로 갱신한다.
5. Harness 계약과 문서 정합성을 재검증한다.

INPUTS / SOURCE OF TRUTH:

1. 현재 사용자의 다음 READY 진행 요구
2. 프로젝트 `AGENTS.md`, `CLAUDE.md`, Harness와 P4 보고서
3. Supabase MCP가 반환한 실제 project·schema·migration·advisor 상태
4. 실제 Git·Docker·listener 상태

충돌 시 실제 공급자 상태를 우선하며, 과거 `COMING_UP`·후보 표기는 역사 증거로만 보존한다.

AUTHORITY / PERMISSIONS:

- 읽기: 저장소, Harness, Docker, listener, Supabase project metadata·schema·advisor
- 로컬 쓰기: 이 실행계약, P4 감사 증거·보고, Harness·로드맵·현재 상태
- 외부 쓰기: 없음
- 명시 확인 필요: 새 Supabase project/branch 비용 확인·생성, OAuth/Secret, migration, DNS/TLS

CONSTRAINTS:

- 기존 SAFE-LINK 프로젝트와 사용자 dirty worktree를 보존한다.
- 사실·가정·미결정·외부 확인 필요를 분리한다.
- 한 Loop에는 현재 READY 한 건만 둔다.

SUCCESS CRITERIA:

- Supabase 프로젝트가 `ACTIVE_HEALTHY`인지 확인된다.
- table·migration·security advisor 수와 주요 오류가 기록된다.
- 기존 SAFE-LINK 업무 schema와 SQCM-i inventory schema를 구분한다.
- 재사용 판정과 다음 READY가 Harness·로드맵·현재 상태에서 일치한다.
- 기존 Docker 3서비스와 보호 listener가 보존된다.

FAILURE CRITERIA:

- 공급자 조회 실패로 provenance를 판정할 수 없다.
- 감사 중 외부 데이터·schema·권한이 변경된다.
- 기존 프로젝트를 비품관리 전용이라고 증거 없이 간주한다.
- 보호 서비스 변화나 Secret 노출이 발견된다.
- 동일 원인의 실패가 3회 반복된다.

VERIFICATION / EVIDENCE:

- `npm.cmd run harness:status`
- `npm.cmd run harness:check`
- Supabase project·organization·tables·migrations·security/performance advisors
- Docker health와 1234·11434·18765·18766·18767 listener
- `git diff --check`와 변경 파일 검토

OUTPUTS / FORMAT:

- 실행계약: 이 파일
- 기계 증거: `agent docs/harness/P4_G0_SUPABASE_AUDIT_EVIDENCE.json`
- 사람용 보고: `docs/phase-reports/97_P4_G0_Supabase_Provenance_Security_Audit.md`
- 상태 정본: `agent docs/harness/MASTER_ROADMAP.json`, `docs/roadmap.md`, `docs/current-state.md`
- Secret·토큰·세션·자격증명 원문은 기록하지 않는다.

STOP CONDITION:

- 감사 판정과 다음 READY가 정본에 일치하면 종료한다.
- 새 프로젝트 조직 선택·비용 확인이 필요하면 외부 변경 없이 대기한다.
