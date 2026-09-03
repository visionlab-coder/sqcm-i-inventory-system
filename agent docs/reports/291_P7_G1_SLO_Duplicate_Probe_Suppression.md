# P7-G1 SLO 중복 HTTPS probe 차단

기준 시각: 2026-09-03 14:01 KST

## 결과

같은 UTC 날짜에 15분 Heartbeat가 반복되어도 Production HTTPS를 불필요하게 재호출하지 않도록 SLO collector를 보완했다. 원장의 오늘 표본을 probe 전에 검증하며, 2026-09-03 actual 재실행은 표본 1/30을 유지하고 HTTP read·write 0건으로 종료했다.

## 7범주 체크리스트

- [x] 목표·범위: SLO 일별 수집의 중복 외부 호출만 제거했다.
- [x] 승인 산출물: 기존 Production URL·원장·30일 계약을 보존했다.
- [x] 검증: 구현 전 신규 테스트 FAIL, 구현 후 focused 6/6 PASS했다.
- [x] 보안·외부 경계: 중복 경로의 HTTP read·Secret read·write는 모두 0건이다.
- [x] 문서·Harness: SLO collector 계약·가속 큐·실행 보고를 같은 사실로 동기화했다.
- [x] Git·rollback: 원장 삭제·덮어쓰기를 수행하지 않았다.
- [ ] Phase 완료: 실제 SLO는 1/30이며 외부 운영 인수 증거도 남아 있다.

## 다음 READY

P7-G1을 유지하고 다음 UTC 날짜에만 실제 HTTPS 표본을 추가한다.
