# P4-G0 Migration History Adapter Reverify 실행계약

ROLE:
SQCM-i application·Supabase migration history 재검증자.

GOAL:
오염되지 않은 새 일반 PostgreSQL과 실제 Supabase provider history에서 application 23개·Supabase 24개 계약 및 전체 통합 검증을 한 번에 통과시킨다.

SCOPE:
- `db/migration-targets.json`과 migration verifier 읽기 검증
- 새 격리 Docker 3서비스
- 로컬 구문·단위·통합·health·smoke
- Supabase project `iuoljosldyymkburagwj`의 migration·advisor 읽기 검증
- READY 증거와 상태 정본

OUT OF SCOPE:
- application 코드·migration SQL 변경
- Supabase schema·migration·권한 변경
- 기존 Docker project·보호 서비스 변경
- commit·push·배포·Production 전환

WORKFLOW:
1. Harness와 dirty baseline을 확인한다.
2. 새 env·새 volume·고유 loopback port로 격리 Docker 3서비스를 한 번 생성한다.
3. seed password hash 일치와 계정 미잠금을 시험 전에 확인한다.
4. frontend URL·seed 환경·순차 실행을 처음부터 고정해 전체 통합을 실행한다.
5. application history 23개와 Supabase provider history 24개·advisor를 확인한다.
6. 임시 자원을 제거하고 보호 서비스 보존 후 증거·정본을 갱신한다.

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자 재개 승인과 장기 Goal+Harness
2. `MASTER_ROADMAP.json`, manifest, migration 001~024
3. 실제 Docker·테스트·Supabase provider history
충돌 시 실제 관측값을 우선하되 승인·보안 불변식을 낮추지 않는다.

AUTHORITY / PERMISSIONS:
- 읽기: 저장소·Docker·포트·Supabase metadata
- 로컬 쓰기: 시험 자원과 Agent Docs·Harness allowlist
- 외부 쓰기: 없음

CONSTRAINTS:
- 테스트 시작 전 세 seed 계정은 password hash 일치, failed count 0, unlocked여야 한다.
- `INTEGRATION_BASE_URL`은 격리 frontend loopback 주소다.
- integration 파일 병렬도는 1이다.
- 동일 실패 3회 시 자동 재시도를 중단한다.

SUCCESS CRITERIA:
- Docker `frontend/backend/database` 3/3 healthy
- application history 23개, 023=0, 024=1
- 구문·단위·통합·smoke 실패 0
- Supabase history 24개, Security WARN·ERROR 0
- 임시 자원 제거와 보호 listener 보존

FAILURE CRITERIA / STOP CONDITION:
- 시작 전 계정·환경 preflight가 불일치한다.
- 테스트·history·advisor 필수 조건이 실패한다.
- 기존 서비스 또는 보호 listener가 변경된다.
- 같은 원인이 3회 반복된다.

VERIFICATION / EVIDENCE:
- `npm.cmd run check`
- `node --test --test-concurrency=1 test/integration/**/*.test.js`
- fresh `schema_migrations` 목록과 HTTP health/readiness/smoke
- Supabase migration list·security advisor
- Docker project·임시 파일 cleanup과 보호 PID 확인

OUTPUTS / FORMAT:
- `agent docs/harness/P4_G0_MIGRATION_HISTORY_REVERIFY_EVIDENCE.json`
- `docs/phase-reports/105_P4_G0_Migration_History_Adapter_Reverify.md`
- 상태 변경 시 Harness·로드맵·현재상태 동기화
