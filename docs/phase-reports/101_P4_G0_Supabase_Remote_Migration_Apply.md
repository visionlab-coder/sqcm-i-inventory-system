# P4-G0 Supabase 원격 Migration 적용 결과

기준일: 2026-08-29

결과: **migration 적용 PASS / 보안 advisor WARN 보완 중 / P4 미완료**

## 적용 결과

사용자가 생성한 전용 project `iuoljosldyymkburagwj`에 migration 001~023을 순서대로 적용했다. 23/23이 한 번에 통과했고 실패·재시도는 없었다. 기존 SAFE-LINK project, Auth, Storage, Secret, DNS/TLS, Production은 변경하지 않았다.

## 체크리스트

| 범주 | 상태 | 증거 |
|---|---|---|
| 정확한 대상·범위 | [x] 증거 있는 완료 | 전용 project 한 곳, 001~023 |
| migration 순서·수 | [x] 증거 있는 완료 | provider history 23건 |
| application schema | [x] 증거 있는 완료 | public table 52개 |
| RLS | [x] 증거 있는 완료 | 52/52 enabled |
| Data API 역할 | [x] 증거 있는 완료 | 세 역할 schema/table/sequence/function 접근 0 |
| SECURITY DEFINER | [x] 증거 있는 완료 | 0개 |
| Security advisor ERROR | [x] 증거 있는 완료 | ERROR 0 |
| Security advisor WARN | [!] 보완 필요 | mutable search_path 3개 |
| provider/runtime migration history | [!] 보완 필요 | Supabase history와 app `schema_migrations` 계약 차이 |
| Secret·Production 경계 | [x] 증거 있는 완료 | 조회·생성·배포 없음 |

## 52개와 53개의 차이

격리 로컬 시험의 53번째 table은 앱 runner가 자체 생성하는 `public.schema_migrations`다. Supabase MCP migration은 provider의 `supabase_migrations` 이력에 23건을 기록하므로 application table은 52개가 정확하다. 모든 52개에서 RLS가 활성화됐다.

이 차이는 보안 실패가 아니지만 현재 backend `db:verify`가 `public.schema_migrations`만 검사하므로 staging 연결 전에 provider migration history를 인식하는 adapter가 필요하다.

## Advisor 판정

- Security: INFO 52, WARN 3, ERROR 0
- INFO 52는 Data API를 완전히 거부해 policy를 의도적으로 만들지 않은 설계와 일치한다.
- WARN 3은 `default_organization_id`, `set_audit_organization`, `ensure_asset_financial_profile`의 mutable `search_path`다.
- Performance: INFO 129뿐이다. 새 DB라 unused index는 workload 증거가 없고, unindexed FK는 별도 성능 검토 큐로 보존한다.

## 다음 READY

`P4-G0-SUPABASE-FUNCTION-SEARCH-PATH-HARDENING`: 세 함수에 고정 `search_path`를 부여하는 forward-only migration 024를 설계·PostgreSQL 17에서 검증한다. advisor WARN이 0이 된 뒤 provider migration history adapter를 보완한다.
