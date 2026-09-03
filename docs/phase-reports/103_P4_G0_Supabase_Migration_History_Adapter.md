# P4-G0 Supabase Migration History Adapter 결과

기준일: 2026-08-29

결과: **adapter 단위·provider content PASS / 3계층 차단 / 동일 원인 3회 중단**

## 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| 명시 history mode | [x] 증거 있는 완료 | application·supabase, auto 거부 |
| provider 이름·순서 | [x] 증거 있는 완료 | 24/24 |
| provider SQL 본문 | [x] 증거 있는 완료 | 정규화 digest 24/24 |
| 누락·순서·본문 drift | [x] 증거 있는 완료 | focused 12/12 |
| 전체 단위 | [x] 증거 있는 완료 | 131/131 |
| JavaScript 구문 | [x] 증거 있는 완료 | 110개 |
| 3계층 backend 시작 | [!] 차단 | `role postgres does not exist` |
| 임시 자원 정리 | [x] 증거 있는 완료 | project containers·volumes 제거 |
| 기존 서비스 보존 | [x] 증거 있는 완료 | 기존 Compose project 미변경 |

## 실패 기록

- 재현: fresh application Compose database에서 migration 001~024 자동 적용
- 실제: migration 023에서 `role postgres does not exist`, backend unhealthy
- 기대: application mode backend healthy
- 원인 계층: migration target portability
- 원인: Supabase 전용 default privilege 구문이 `POSTGRES_USER=seowon`인 일반 PostgreSQL에도 적용됨
- 영향: fresh non-Supabase DB는 migration 022 이후 시작 불가
- 재시도: 같은 backend 실패 3회, 자동 재시도 중단
- 정리: 임시 컨테이너·network·volume 모두 제거

## 안전한 다음 설계

이미 원격 적용된 migration 023을 수정하면 provider history 본문 검증과 forward-only 불변식을 깨뜨린다. 다음 READY는 migration 파일을 바꾸지 않고 별도 target manifest에서 023을 `supabase-only`로 선언해 application runner가 제외하도록 하는 것이다. Supabase history mode는 001~024 전체를 계속 요구한다.

## 다음 READY

`P4-G0-MULTI-PROVIDER-MIGRATION-TARGET-DESIGN`
