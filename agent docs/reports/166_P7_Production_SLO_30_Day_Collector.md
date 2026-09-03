# ACC-P7-16 Production SLO 30일 수집기

## 결과/상태

P7 SLO compiler에 필요한 실제 30일 원본을 생성하는 수집기를 준비했다. 현재 P6가 actual 완료되지 않았으므로 `READY_WAIT_P6_ACTUAL_CUTOVER`이며 HTTP 요청과 파일 쓰기는 모두 0건이다.

## 체크리스트

- [x] P6 actual 완료·P7 진행·Production GO 3중 Gate
- [x] exact URL `https://inventory.safe-link.co.kr`
- [x] `/health`와 `/api/readiness` 동시 200 판정
- [x] 저장소 밖 물리 경로만 허용
- [x] JSONL append-only 원장과 동시 실행 lock
- [x] UTC 하루 최대 1표본
- [x] 연속 30개 UTC 날짜 강제
- [x] compiler 호환 export 원자 작성·덮어쓰기 금지
- [x] staging·중복·날짜 공백·symlink/reparse 차단
- [ ] P6 actual cutover 완료
- [ ] 실제 30일 표본 수집
- [ ] SLO evidence compiler PASS

## 실행 경계

기본 명령은 상태만 보고한다. P6/P7 상태, 저장소 밖 `P7_SLO_LEDGER_FILE`·`P7_SLO_MEASUREMENT_INPUT_FILE`, exact 확인값과 `--collect`가 함께 있어야 실제 read-only HTTPS 표본을 기록한다. Secret은 사용하지 않는다.

## 다음 READY

현재 READY는 `P7-G1-OPERATIONS-ACTIVATION-AND-SIGNOFF`다. P6 actual 완료 후 실제 원장에 1/30 표본을 기록했다. 같은 UTC 날짜의 Heartbeat는 원장을 먼저 검증해 `PASS_SLO_SAMPLE_ALREADY_RECORDED_FOR_UTC_DAY`를 반환하고, 이 경우 `externalHttpReadPerformed=false`와 write 0건을 유지한다.
