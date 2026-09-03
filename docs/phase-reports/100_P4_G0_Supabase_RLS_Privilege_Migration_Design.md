# P4-G0 Supabase RLS·Privilege Migration 설계·로컬 검증

기준일: 2026-08-29

결과: **로컬 설계 PASS / 원격 적용 승인 대기**

## 결과

forward-only migration `023_supabase_data_api_lockdown.sql`을 추가했다. 53개 `public` base table에 RLS를 활성화하고 Supabase Data API 역할 `anon`·`authenticated`·`service_role`의 schema·table·sequence·function 권한을 회수한다. PUBLIC의 function RPC·schema USAGE·CREATE도 회수하고, Supabase 공식 지침에 맞춰 `FOR ROLE postgres`의 미래 기본 권한도 제거한다.

`FORCE ROW LEVEL SECURITY`는 사용하지 않는다. 따라서 migration owner인 backend 직접 PostgreSQL 연결은 기존 방식으로 동작하고, `anon`·`authenticated` Data API 경로만 fail-closed된다. application policy는 의도적으로 0개다.

## 체크리스트

| 항목 | 결과 | 증거 |
|---|---|---|
| forward-only migration 023 | [x] PASS | DROP·data rewrite 없음 |
| 일반 PostgreSQL 역할 부재 호환 | [x] PASS | 역할 존재 조건부 REVOKE |
| PostgreSQL 17 적용·checksum | [x] PASS | 23/23 |
| RLS | [x] PASS | 53/53 enabled |
| Data API table 접근 | [x] PASS | anon 0, authenticated 0, service_role 0 |
| Data API schema USAGE | [x] PASS | 세 역할 모두 false |
| backend owner 호환 | [x] PASS | 등록→대여→반납 1/1 |
| 단위·구문 | [x] PASS | 125/125, 108 files |
| 임시 컨테이너 정리 | [x] PASS | 2개 명시 컨테이너 제거 |
| 원격 Supabase 변경 없음 | [x] PASS | table 0, migration 0 재확인 |
| 보호 서비스 | [x] PASS | 1234·11434·18765·18766·18767 PID 보존 |

## 발견과 수정

첫 격리 시험에서 역할별 REVOKE 후에도 PostgreSQL `PUBLIC`을 통한 schema USAGE가 남았다. `REVOKE USAGE ON SCHEMA public FROM PUBLIC`을 추가한 뒤 `false|0|false|0`으로 재검증했다. 다음 시험의 실패는 psql boolean 표기를 `f`로 예상한 시험 assertion 차이였으며 실제 권한은 이미 false였다. 기대값을 실제 출력 형식으로 고쳐 최종 시험을 통과했다.

## 원격 상태와 경계

전용 project `iuoljosldyymkburagwj`는 `ACTIVE_HEALTHY`, PostgreSQL 17.6이며 이번 Loop 종료 시에도 `public` table 0, migration 0이다. SQL·Secret·API key·service role은 원격에서 조회하거나 변경하지 않았다.

이번 변경은 저장소의 custom forward-only migration runner 형식인 `023_*.sql`을 따른다. Supabase 원격 적용은 local 설계와 다른 외부 상태 변경이므로 별도 명시 승인을 요구한다.

## 다음 READY

`P4-G0-SUPABASE-RLS-MIGRATION-APPLY-APPROVAL`

승인 대상은 전용 project `iuoljosldyymkburagwj` 하나이며, 행위는 현재 빈 DB에 migration 001~023을 적용한 뒤 RLS·권한 assertion과 Supabase security/performance advisor를 읽기 검증하는 것이다. rollback은 빈 전용 project 기준이며, 실제 application data가 생기기 전 단계에서만 실행한다.
