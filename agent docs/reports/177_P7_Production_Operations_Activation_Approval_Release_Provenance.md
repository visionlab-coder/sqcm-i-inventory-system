# ACC-P7-27 Production Operations Activation Approval and Release Provenance

기준일: 2026-09-02

## 결과 / 상태

- [x] 동일 run ID의 승인·release 교체 재사용 실패 테스트 재현
- [x] 이전 승인·release receipt의 새 승인 흐름 재사용 실패 테스트 재현
- [x] JSON key 순서와 무관한 canonical approval SHA-256
- [x] 승인 내용 변경 시 digest 변경
- [x] schema 2 root claim·lease·receipt에 approval SHA-256과 release SHA 결합
- [x] 현재 승인·release와 다른 재개 증거를 child 실행 전에 차단
- [x] P6 actual·P7 활성화·Production GO 전 approval read·root claim·lease·child·write 0건
- [ ] 실제 P6 cutover와 P7 운영 활성화 실행

상태는 `EVIDENCE_COMPLETE`인 P7 사전준비 Packet이다. 공식 Phase는 P6 6/8, `productionGo=false`, P7 미착수를 유지한다.

## 실행 계약

승인 manifest는 key 정렬 canonical JSON으로 SHA-256을 계산한다. root claim, lease와 각 단계 receipt는 run ID의 SHA-256뿐 아니라 exact release SHA와 approval SHA-256을 함께 기록한다. 따라서 동일 run ID를 유지하더라도 승인자·승인시각·허용행위·release 등 승인 내용이 바뀌면 기존 폴더와 receipt로 재개할 수 없다.

## 검증 증거

- 구현 전 focused test → 13 PASS, 2 EXPECTED FAIL
- 구현 후 `node --test test/unit/operations-activation-orchestrator.test.js` → 16/16 PASS
- `npm.cmd run operations:activation-orchestrator` → `READY_WAIT_P6_ACTUAL_CUTOVER`, approval read 0, root claim 0, lease 0, child 0, receipt 0
- `npm.cmd run check:syntax` → 282/282 PASS
- `npm.cmd run test:unit` → 445 PASS, 1 Windows-only SKIP, 0 FAIL (446 total)
- `npm.cmd run harness:verify` → PASS, staging·Production 3서비스와 모든 P6/P7 dry-run exit 0

## 미완료 / 외부 Gate

실제 승인 문서·root claim·lease·운영 child·Production read/write·메시지·DB mutation·서명은 만들지 않았다. 승인된 P6 actual cutover 뒤 P7이 활성화된 경우에만 저장소 밖 물리 receipt root에서 동작한다.
