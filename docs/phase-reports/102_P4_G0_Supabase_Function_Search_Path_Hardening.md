# P4-G0 Supabase Function Search Path Hardening

기준일: 2026-08-29

결과: **로컬·전용 Supabase 적용 PASS / Security WARN 0**

## 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| advisor 함수 3개 추적 | [x] 증거 있는 완료 | 정확한 signature 3개 |
| forward-only migration 024 | [x] 증거 있는 완료 | ALTER FUNCTION SET 3건 |
| 권한 상승 없음 | [x] 증거 있는 완료 | SECURITY DEFINER·GRANT 0 |
| PostgreSQL 17 | [x] 증거 있는 완료 | migration 24/24 |
| proconfig | [x] 증거 있는 완료 | 3/3 `pg_catalog, public` |
| backend owner 업무 왕복 | [x] 증거 있는 완료 | 1/1 PASS |
| 임시 환경 정리 | [x] 증거 있는 완료 | 컨테이너 제거 |

세 함수의 본문과 권한은 변경하지 않았다. migration 023이 public CREATE를 회수한 상태에서 system catalog를 먼저 해석하도록 search_path만 고정한다.

migration 024를 전용 project `iuoljosldyymkburagwj`에 적용했다. provider history는 24건이고 세 함수의 proconfig는 모두 `search_path=pg_catalog, public`이다. Data API 세 역할 접근은 계속 0이며 Security advisor는 INFO 52, WARN 0, ERROR 0이다.

다음 READY는 backend가 Supabase의 `supabase_migrations` provider history를 안전하게 인식하도록 migration verification adapter를 보완하는 것이다.
