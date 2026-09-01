# ACC-P7-26 Production Operations Receipt Root Ownership and No-Overwrite

기준일: 2026-09-02

## 결과 / 상태

- [x] 서로 다른 run이 같은 receipt root를 공유하는 실패 테스트 재현
- [x] `exists → rename` 경쟁에서 기존 receipt가 교체되는 실패 테스트 재현
- [x] 최초 run ID SHA-256 기반 영속 root claim
- [x] 다른 run의 root 재사용을 lease·child 실행 전에 차단
- [x] hard-link no-replace 방식의 최종 receipt 게시
- [x] 경쟁·실패 시 기존 receipt 보존과 임시파일 정리
- [x] P6 actual·P7 활성화·Production GO 전 root claim·lease·child·write 0건
- [ ] 실제 P6 cutover와 P7 운영 활성화 실행

상태는 `EVIDENCE_COMPLETE`인 P7 사전준비 Packet이다. 공식 Phase는 P6 6/8, `productionGo=false`, P7 미착수를 유지한다.

## 실행 계약

오케스트레이터는 승인된 run ID의 원문 대신 SHA-256만 포함한 `.operations-activation-root.json`을 receipt root에 create-only로 게시한다. 동일 run은 claim을 재사용할 수 있지만 다른 run은 `OPERATIONS_ACTIVATION_RECEIPT_ROOT_RUN_MISMATCH`로 중단된다. 각 receipt는 fsync된 임시파일의 hard link를 최종 경로에 생성하므로, 최종 경로가 검사 뒤 생성되는 경쟁에서도 기존 파일을 덮어쓰지 않는다.

## 검증 증거

- 구현 전 focused test → 11 PASS, 2 EXPECTED FAIL
- 구현 후 `node --test test/unit/operations-activation-orchestrator.test.js` → 13/13 PASS
- `npm.cmd run operations:activation-orchestrator` → `READY_WAIT_P6_ACTUAL_CUTOVER`, root claim 0, lease 0, child 0, receipt 0
- `npm.cmd run check:syntax` → 282/282 PASS
- `npm.cmd run test:unit` → 442 PASS, 1 Windows-only SKIP, 0 FAIL (443 total)
- `npm.cmd run harness:verify` → PASS, staging·Production 3서비스와 모든 P6/P7 dry-run exit 0

## 미완료 / 외부 Gate

실제 root claim·lease·운영 child·Production read/write·메시지·DB mutation·서명은 만들지 않았다. 승인된 P6 actual cutover 뒤 P7이 활성화된 경우에만 저장소 밖 물리 receipt root에서 동작한다.
