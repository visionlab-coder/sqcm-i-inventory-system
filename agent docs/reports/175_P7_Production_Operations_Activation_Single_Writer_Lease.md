# ACC-P7-25 Production Operations Activation Single-Writer Lease

기준일: 2026-09-02

## 결과 / 상태

- [x] 중첩 Heartbeat의 동일 run·동일 READY 중복 실행 실패 테스트 재현
- [x] 저장소 밖 receipt root의 create-only single-writer lease
- [x] 두 번째 동시 실행은 child 0건의 안전 대기
- [x] exact owner만 정상 lease 해제
- [x] crash stale lease 자동 삭제 금지와 수동 검토 우선
- [x] 100번째 이상 WAIT도 정렬되는 4자리 attempt receipt
- [x] P6 actual·P7 활성화·Production GO 전 lease·child·write 0건
- [ ] 실제 P6 cutover와 P7 운영 활성화 실행

상태는 `EVIDENCE_COMPLETE`인 P7 사전준비 Packet이다. 공식 Phase는 P6 6/8, `productionGo=false`, P7 미착수를 유지한다.

## 실행 계약

오케스트레이터는 approval의 run ID를 SHA-256으로 축약한 lock 파일을 `wx` 모드로 생성한 뒤에만 receipt를 읽고 다음 child를 실행한다. lock이 있으면 `READY_WAIT_OPERATIONS_ACTIVATION_LEASE`이며 실패 횟수에 포함하지 않는다. 프로세스 crash로 lock이 남은 경우 자동으로 오래됐다고 판단해 삭제하지 않으며, 운영자는 해당 process·receipt·외부 공급자 상태를 확인한 뒤 별도 복구 결정을 해야 한다.

## 검증 증거

- 구현 전 focused test → 8 PASS, 3 EXPECTED FAIL
- 구현 후 `node --test test/unit/operations-activation-orchestrator.test.js` → 11/11 PASS
- `npm.cmd run operations:activation-orchestrator` → `READY_WAIT_P6_ACTUAL_CUTOVER`, lease 0, child 0, receipt 0
- `npm.cmd run check:syntax` → 282/282 PASS
- `npm.cmd run test:unit` → 440 PASS, 1 Windows-only SKIP, 0 FAIL (441 total)
- `npm.cmd run harness:verify` → PASS, staging·Production 3서비스와 모든 P6/P7 dry-run exit 0

## 미완료 / 외부 Gate

실제 lock·운영 child·Production read/write·메시지·DB mutation·서명은 만들지 않았다. 승인된 P6 actual cutover 뒤 P7이 활성화된 경우에만 외부 receipt root에서 동작한다.
