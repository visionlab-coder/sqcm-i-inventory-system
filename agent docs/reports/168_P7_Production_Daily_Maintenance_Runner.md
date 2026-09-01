# ACC-P7-18 Production Daily Maintenance Runner

## 결과

- [x] P6 actual·P7 활성화·Production GO 전 read/write 0건
- [x] exact Production frontend/API/readiness HTTPS 200
- [x] PostgreSQL `seowon_inventory` 읽기 전용 query
- [x] 최근 15분 backend HTTP 5xx 0건
- [x] 최근 15분 로그인 실패를 이전 24시간 적응 임계치와 비교
- [x] 최신 Production backup SHA-256과 24시간 age 검증
- [x] frontend/backend 불변 image revision 일치
- [x] 실제 운영자·일정·다음 실행 시각 참조 필수
- [x] 저장소 밖 신규 물리 파일에 원자적 1회 쓰기
- [x] focused test 5/5 PASS
- [x] JavaScript syntax 264/264 PASS
- [x] repository unit 396 PASS·0 FAIL·1 Windows platform SKIP
- [x] Harness verify PASS

## 현재 판정

`npm.cmd run operations:maintenance-runner`는 `READY_WAIT_P6_ACTUAL_CUTOVER`를 반환했다. `externalHttpReadPerformed=false`, `localRuntimeReadPerformed=false`, `localEvidenceWritePerformed=false`, `externalMutationPerformed=false`이며 실제 Production 일일점검은 `NOT_RUN`이다.

## 실제 실행 입력

- `P7_MAINTENANCE_EXECUTION_INPUT_FILE`: 저장소 밖 신규 출력 파일
- `P7_MAINTENANCE_OPERATOR_REF`: `identity://...` 실제 운영자
- `P7_MAINTENANCE_SCHEDULE_REF`: `maintenance://...` 실제 일정
- `P7_MAINTENANCE_NEXT_SCHEDULED_AT`: 다음 실행 ISO 시각
- `P7_MAINTENANCE_RUNNER_CONFIRMATION`: exact 실행 확인

P6 actual 완료와 P7 활성화 뒤에만 `npm.cmd run operations:maintenance-runner -- --execute`를 실행한다.
