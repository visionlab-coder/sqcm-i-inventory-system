# P4-G0 Supabase Migration·Provider 사전검토

기준일: 2026-08-29
결과: **PostgreSQL 17 PASS / Supabase 원격 migration HOLD**
로드맵: **4 / 8**, P4 진행 중

## 결과

로컬 migration 22개는 PostgreSQL 17에서 순서대로 모두 적용되고 checksum 검증도 22/22 통과했다. SQL 호환성과 forward-only migration runner는 정상이다.

그러나 적용 후 `public` base table은 53개인데 RLS 활성 table과 policy가 각각 0개다. Supabase `public` schema의 Data API 경계를 고려하면 현재 migration을 전용 프로젝트에 그대로 적용할 수 없다. 원격 SQL·migration은 실행하지 않았다.

## 검증표

| 항목 | 결과 |
|---|---|
| migration 파일 | 22개, `001`→`022` 순서 PASS |
| PostgreSQL 17 적용 | PASS 22/22 |
| checksum 검증 | PASS 22/22 |
| checksum 단위시험 | PASS 2/2 |
| 생성 public base table | 53 |
| RLS 활성 table | **0** |
| RLS policy | **0** |
| DROP/TRUNCATE/ALTER TYPE | 0 |
| SECURITY DEFINER/extension | 0 |
| function/trigger | 3/2 |
| 임시 컨테이너 | 제거 완료 |

## Provider·Secret 계약

`config/operations.manifest.example.json`에는 9개 `secret://inventory/staging/...` 경로가 있지만 모두 template이다. 실제 Secret Manager namespace나 resource reference가 아니다.

현재 공백:

- 실제 `DATABASE_URL`/database credential reference
- frontend용 Supabase publishable key reference
- backend privileged access가 필요할 경우 service role의 최소권한·회전·철회 계약
- Storage bucket·RLS policy·credential reference
- OIDC client·signing·authorization UI와 client secret reference
- event publisher·PITR·RPO/RTO

Secret 값은 조회하거나 기록하지 않았다.

## 완료 체크리스트

| 범주 | 상태 | 증거 |
|---|---|---|
| migration 순서·무결성 | [x] | 22/22 적용·검증 |
| PostgreSQL 17 호환 | [x] | 격리 컨테이너 PASS |
| destructive SQL | [x] | DROP/TRUNCATE/ALTER TYPE 0 |
| Supabase 접근 통제 | [!] | 53 table, RLS 0, policy 0 |
| Secret reference | [!] | template 9개, 실제 0 |
| 기존 환경 보존 | [x] | 임시 컨테이너 제거, 기존 3+3 healthy |
| 원격 변경 방지 | [x] | 신규 Supabase DB table/migration 0 유지 |

이번 READY는 사전검토 자체는 완료했지만 원격 migration Gate는 **HOLD**다.

## 다음 READY

`P4-G0-SUPABASE-RLS-AND-PRIVILEGE-MIGRATION-DESIGN`

기존 backend의 직접 PostgreSQL 연결은 보존하면서 Supabase Data API의 `anon`·`authenticated` 접근을 차단하는 forward-only migration 023을 설계한다. 모든 application table에 RLS를 활성화하고 기본 public privileges를 회수하되, plain PostgreSQL 17과 Supabase 역할 유무 차이를 안전하게 처리해야 한다. 설계·로컬 시험 후에만 실제 원격 migration 승인을 요청한다.

진행률: `████░░░░ 4 / 8`
