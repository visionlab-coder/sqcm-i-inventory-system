# P4-G0 Multi-provider Migration Target 결과

기준일: 2026-08-31

결과: **target manifest 구현 PASS / fresh 3계층 PASS / 전체 통합 재검증 차단**

## 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| migration 023 불변 | [x] 증거 있는 완료 | 원문·Supabase history 변경 없음 |
| manifest 완전 열거 | [x] 증거 있는 완료 | 24개, 누락·중복 fail-closed |
| application target | [x] 증거 있는 완료 | 23개, 023 제외·024 포함 |
| Supabase target | [x] 증거 있는 완료 | 001~024 전체 |
| focused 단위 | [x] 증거 있는 완료 | 5/5 |
| 전체 단위·구문 | [x] 증거 있는 완료 | 133/133, 구문 110 |
| fresh Docker 3서비스 | [x] 증거 있는 완료 | frontend/backend/database 3/3 healthy |
| fresh application history | [x] 증거 있는 완료 | 23개, 023=0, 024=1 |
| health/readiness | [x] 증거 있는 완료 | HTTP 200/200 |
| 전체 통합 | [!] 차단 | 5 PASS·15 FAIL·1 SKIP, 계정 잠금 누적 |
| 임시 자원 정리 | [x] 증거 있는 완료 | 컨테이너·network·volume·시험 Secret 제거 |
| 기존 서비스 보존 | [x] 증거 있는 완료 | local·synthetic 유지, 보호 PID 3개 유지 |

## 구현 결과

`db/migration-targets.json`은 모든 migration 파일을 순서대로 열거한다. 기본 포함을 추정하지 않으므로 새 migration이 manifest에 없거나 순서가 다르면 시작 전에 실패한다. application runner와 verifier는 023을 제외하고 024를 포함한다. Supabase history verifier는 001~024 전체의 이름·순서·단일 statement·정규화 SQL을 계속 요구한다.

격리 project `sqcmi-p4-target-reverify`의 일반 PostgreSQL 16은 `POSTGRES_USER=seowon`만 가진 상태에서 backend가 healthy가 됐다. `schema_migrations`는 23행이고 023은 0행, 024는 1행이었다. 기존 `role postgres does not exist` 실패는 재현되지 않았다.

## 통합 재검증 중단

- 1차: frontend URL과 seed 환경 전달이 잘못되어 login 401
- 2차: URL·seed 환경을 보정했으나 앞선 실패 누적으로 login 401
- 3차: 순차 실행했으나 세 seed 계정이 `failed_login_count=5`, `locked_until` 설정 상태여서 401/429
- 확인: 세 계정의 password hash는 생성된 seed 비밀번호와 모두 일치
- 판정: 제품 migration 실패가 아니라 오염된 시험 봉투의 계정 잠금
- 중단: 같은 로그인 차단 3회로 더 이상 자동 재시도하지 않음

## 정리·보존

시험 project의 컨테이너·network·두 volume과 임시 Secret 파일을 제거했다. 기존 `seowon-inventory-local`, `seowon-inventory-staging-synthetic`는 유지했다. LM Studio 1234/PID 6632, Ollama 11434/PID 8588, bridge 18765/PID 22716도 보존됐다.

## 다음 READY

`P4-G0-SUPABASE-MIGRATION-HISTORY-ADAPTER-REVERIFY`

새 격리 DB를 한 번만 생성하고 시작 전부터 올바른 frontend URL·seed 환경·순차 통합 실행을 사용해 application 23개와 Supabase 24개 양쪽을 재검증해야 한다.
