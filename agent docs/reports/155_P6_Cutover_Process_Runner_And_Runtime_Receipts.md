# P6 Cutover Process Runner 및 Runtime Receipt 체크리스트

기준일: 2026-09-01

## 결과

`ACC-P6-11-CUTOVER-PROCESS-RUNNER-AND-RUNTIME-RECEIPTS`의 로컬 준비를 완료했다. 실제 공개 전환은 실행하지 않았고 P6는 진행 중, `productionGo=false`다.

## 7범주 체크리스트

- [x] 대상: 구조화 adapter의 12 Gate·14 step만 실행 대상으로 고정
- [x] 시간·권한: 실제 execution engine이 변경창·확인 전 handler를 호출하지 않는 계약 유지
- [x] 상태 판정: 마지막 최상위 JSON `status` 정규화, migration exit 0만 `PASS_EXIT_ZERO`
- [x] 증거: step 14건과 Gate 12건의 최소 JSON receipt 계약
- [x] 보안: stdout·stderr·환경변수·Secret 원문 미기록
- [x] 파일 안전: 저장소 밖 물리 디렉터리, 경로 경계, `wx` 비덮어쓰기
- [x] 검증: rehearsal PASS, focused PASS, repository check PASS, Harness PASS

## 실제 검증

- `npm.cmd run production:cutover-process-runner-rehearsal`: `PASS_CUTOVER_PROCESS_RUNNER_REHEARSAL`, Gate 12, step 14, receipt 26
- `node --test test/unit/production-cutover-process-runner.test.js`: 2 PASS, 0 FAIL, Windows symlink 권한 종속 1 SKIP
- `npm.cmd run check`: 구문 231개, 단위 335 PASS, 0 FAIL, 동일 1 SKIP
- `npm.cmd run harness:verify`: PASS

## 미실행·다음 Gate

- 실제 child process, DNS/TLS, 계정, route 변경: `NOT_RUN`
- 실제 runtime receipt: `NOT_RUN`
- 공식 READY: `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`
- 실제 실행은 승인된 2026-09-11 20:00~23:00 KST 변경창에서만 가능하다.
