# P4-G0 Migration History Adapter 재검증 결과

기준일: 2026-08-31

결과: **application 23/23·Supabase 24/24·전체 통합 PASS**

## 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| 실행계약 | [x] 증거 있는 완료 | strict 8/8, warning 0 |
| fresh 계정 preflight | [x] 증거 있는 완료 | 3/3 hash 일치·잠금 없음 |
| Docker 3서비스 | [x] 증거 있는 완료 | 3/3 healthy, loopback-only |
| application history | [x] 증거 있는 완료 | 23/23, 023=0, 024=1 |
| 구문·단위 | [x] 증거 있는 완료 | 110, 133/133 |
| 전체 통합 | [x] 증거 있는 완료 | 20 PASS·0 FAIL·1 P3 Defender SKIP |
| smoke·maintenance | [x] 증거 있는 완료 | 5/5, PASS |
| 시험 후 계정 | [x] 증거 있는 완료 | failed count 0·잠금 없음 3/3 |
| Supabase history | [x] 증거 있는 완료 | 24/24 이름·순서·본문 |
| Supabase 보안 | [x] 증거 있는 완료 | RLS 52/52, role grant 0, WARN·ERROR 0 |
| 임시 자원 정리 | [x] 증거 있는 완료 | project·volume·network·Secret 제거 |
| 기존 서비스 보존 | [x] 증거 있는 완료 | 기존 Docker·보호 PID 유지 |

## 판정

새 격리 환경에서 시험 시작 전에 frontend URL, seed 환경과 순차 통합 실행을 고정했다. 세 seed 계정은 password hash가 일치했고 실패 횟수 0·잠금 없음이었다. 전체 통합은 20 PASS·0 FAIL이며 실제 Defender 시험 1건은 P3 범위라 SKIP으로 유지했다.

application `schema_migrations`는 manifest 대상과 정확히 일치하는 23/23이다. Supabase 전용 023은 적용되지 않았고 공통 024는 적용됐다. 원격 Supabase는 24개 migration의 이름·순서뿐 아니라 정규화 SQL 본문 digest도 24/24 일치했다.

Supabase project는 ACTIVE_HEALTHY다. public table 52/52에 RLS가 활성화됐고 Data API 역할의 table·routine grant는 0이다. Security Advisor는 의도된 no-policy INFO 52만 있으며 WARN·ERROR는 0이다.

## 정리

격리 시험 project와 두 volume, network, 임시 난수 환경 파일을 제거했다. 기존 local·synthetic Docker project와 LM Studio 1234/PID 6632, Ollama 11434/PID 8588, bridge 18765/PID 22716은 보존했다.

## 다음 READY

`P4-G1-STAGING-DEPLOYMENT-PREFLIGHT`
