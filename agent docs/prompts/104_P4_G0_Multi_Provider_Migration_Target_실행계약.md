# P4-G0 Multi-provider Migration Target 실행계약

ROLE:
SQCM-i migration portability 구현·검증자.

GOAL:
이미 적용된 migration 023을 변경하지 않고 명시적 target manifest로 application과 Supabase migration 집합을 분리해 fresh 일반 PostgreSQL backend가 정상 기동하도록 한다.

SCOPE:
- `db/migration-targets.json`
- application migration runner·verifier
- Supabase provider history verifier
- 관련 단위·통합·Docker 검증과 Phase 증거

OUT OF SCOPE:
- migration 023·024 원문 변경
- Supabase 원격 migration 추가·삭제·history repair
- 기존 Docker project·37봇·보호 서비스 변경
- commit·push·배포·Production 변경

WORKFLOW:
1. migration 파일과 provider history 계약을 조사한다.
2. 모든 migration을 순서대로 열거하는 fail-closed manifest를 추가한다.
3. application은 023을 제외하고 024를 포함하며, Supabase는 001~024 전체를 요구하게 한다.
4. 단위 검사 후 격리 fresh Compose에서 3서비스·migration 집합·health를 검증한다.
5. 동일 실패가 3회 반복되면 재시도를 중단하고 증거와 다음 READY를 기록한다.

INPUTS / SOURCE OF TRUTH:
1. 사용자 승인과 장기 Goal+Harness
2. `MASTER_ROADMAP.json`, migration 001~024, 현재 코드·테스트
3. Supabase 공식 migration history 문서와 실제 provider history
충돌 시 위 순서를 따르며 이미 적용된 migration은 불변으로 보존한다.

AUTHORITY / PERMISSIONS:
- 읽기: 저장소, 로컬 Docker, 보호 포트, Supabase metadata
- 쓰기: 이 READY allowlist의 코드·테스트·Agent Docs·Harness
- 외부 상태 변경: 없음

CONSTRAINTS:
- 한 migration 파일은 manifest에 정확히 한 번만 등장한다.
- application과 Supabase history를 자동 추정하지 않는다.
- 기존 dirty worktree와 실행 중인 Docker project를 보존한다.

SUCCESS CRITERIA:
- manifest가 migration 24개를 누락·중복 없이 열거한다.
- application target은 23개이며 023 제외·024 포함이다.
- Supabase target은 001~024 전체다.
- fresh 일반 PostgreSQL backend와 Docker 3서비스가 healthy다.
- 구문·단위·migration 집합·smoke가 통과한다.

FAILURE CRITERIA / STOP CONDITION:
- migration 023 원문 또는 원격 history가 변경된다.
- manifest 누락·중복·미지원 target을 허용한다.
- 보호 서비스가 변경된다.
- 동일 원인의 실패가 3회 반복된다.

VERIFICATION / EVIDENCE:
- focused migration target unit
- `npm.cmd run check`
- 격리 fresh Compose 3서비스 health와 `schema_migrations` 목록
- HTTP health/readiness
- 통합 시험 결과와 임시 자원 정리

OUTPUTS / FORMAT:
- `db/migration-targets.json`
- `agent docs/harness/P4_G0_MULTI_PROVIDER_MIGRATION_TARGET_EVIDENCE.json`
- `docs/phase-reports/104_P4_G0_Multi_Provider_Migration_Target.md`
- 상태 변경 시 Harness·로드맵·현재상태 동기화
