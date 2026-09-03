# P4-G0 Supabase Function Search Path Hardening 실행계약

기준일: 2026-08-29

ROLE:
SQCM-i Supabase database advisor 보안 보완자다.

GOAL:
Security advisor가 탐지한 public function mutable search_path WARN 3건을 권한 상승이나 업무 회귀 없이 forward-only migration 024로 제거한다.

SCOPE:
- 세 public invoker function의 search_path 고정
- migration 024 정적 계약·PostgreSQL 17 적용·업무 왕복 검증
- 실행계약·증거·보고·Harness·로드맵 동기화

OUT OF SCOPE:
- 함수 본문·권한·SECURITY DEFINER 변경
- application data·Auth·Storage·Secret 변경
- 다른 Supabase project·Production·Git 외부 쓰기

WORKFLOW:
1. advisor WARN의 정확한 함수 세 개를 확인한다.
2. `pg_catalog, public` search_path를 설정하는 migration 024를 작성한다.
3. 정적 역조건과 PostgreSQL 17 migration 24/24를 검증한다.
4. trigger·default function을 포함한 backend owner 업무 왕복을 검증한다.
5. 증거와 다음 원격 적용 READY를 동기화한다.

INPUTS / SOURCE OF TRUTH:
1. Supabase security advisor WARN 3건
2. migration 016·020의 실제 function signature
3. migration 023의 public CREATE·Data API privilege 차단
4. 실제 PostgreSQL 17 시험 결과

AUTHORITY / PERMISSIONS:
- 읽기: 저장소·Harness·advisor 결과·Docker 상태
- 로컬 쓰기: migration 024, 관련 테스트·문서·Harness
- 임시 실행: 명시된 격리 PostgreSQL 17 컨테이너
- 외부 쓰기: 이 READY에서는 없음

CONSTRAINTS:
- 함수 본문을 교체하지 않고 ALTER FUNCTION 설정만 사용한다.
- SECURITY DEFINER·GRANT·data rewrite를 추가하지 않는다.
- 임시 Secret을 기록하지 않고 기존 Docker·listener를 보존한다.

SUCCESS CRITERIA:
- migration 024 적용 후 세 함수 proconfig가 `search_path=pg_catalog, public`이다.
- migration 적용·검증 24/24, focused unit 7/7, owner 업무 왕복 1/1이다.
- 임시 컨테이너가 제거되고 권한 상승 구문이 없다.

FAILURE CRITERIA:
- 함수·trigger·기본값 업무 회귀
- mutable search_path 잔존 또는 SECURITY DEFINER·GRANT 추가
- migration 실패·컨테이너 잔존·Secret 노출

VERIFICATION / EVIDENCE:
- focused Node unit tests
- 격리 PostgreSQL 17 `db:migrate`, `db:verify`
- `pg_proc.proconfig` assertion
- `test/integration/inventory-db.test.js`
- prompt strict, JSON parse, Harness, diff·Secret scan

OUTPUTS / FORMAT:
- migration: `db/migrations/024_function_search_path_hardening.sql`
- unit: `test/unit/supabase-function-search-path.test.js`
- 기계 증거: `agent docs/harness/P4_G0_SUPABASE_FUNCTION_SEARCH_PATH_EVIDENCE.json`
- 보고: `docs/phase-reports/102_P4_G0_Supabase_Function_Search_Path_Hardening.md`

STOP CONDITION:
- 로컬 증거가 PASS하면 전용 project의 migration 024 적용 READY로 전환한다.
- 실패 또는 보호 상태 변화 시 원격 적용 없이 중단한다.
