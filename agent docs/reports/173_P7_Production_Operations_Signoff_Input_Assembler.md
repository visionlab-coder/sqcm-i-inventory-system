# ACC-P7-23 Production Operations Signoff Input Assembler

기준일: 2026-09-02

## 결과 / 상태

- [x] P6 actual 완료·P7 활성화·Production GO 전 input read·write 0건
- [x] P6 actual cutover PASS·exact URL·불변 release SHA·Production GO 검증
- [x] 운영 8영역 actual PASS 문서의 순서·domain·SHA 검증
- [x] maintenance release와 P6 release 교차검증
- [x] 최근 24시간 OPERATIONS_OWNER 승인 receipt·고유 ID·차단 예외 0건 검증
- [x] 운영 업무 6종 전체 수락과 8영역 고유 SHA 일치 검증
- [x] `operations:signoff-evidence` compiler 호환 input의 원자적 1회 기록
- [ ] 실제 운영 책임자 지정·승인 receipt 발급
- [ ] 실제 P6 cutover 및 운영 8영역 증거 생성

상태는 `EVIDENCE_COMPLETE`인 로컬 준비 Packet이다. 공식 Phase는 P6 6/8, `productionGo=false`, P7 미착수를 유지한다.

## 실행 계약

`operations:signoff-input-assembler -- --assemble`는 P6 완료, P7 진행, Production GO, 저장소 밖 물리 P6·8영역·승인 receipt 파일, 저장소 밖 신규 output과 exact confirmation `ACK-ASSEMBLE-P7-PRODUCTION-OPERATIONS-SIGNOFF-INPUT`이 모두 있을 때만 입력을 읽고 파일을 쓴다. 이 실행기는 책임자를 지정하거나 서명을 생성·변경하지 않는다.

## 검증 증거

- `node --check src/operations/operations-signoff-input-assembler.mjs`
- `node --check scripts/operations-signoff-input-assembler.mjs`
- `node --test test/unit/operations-signoff-input-assembler.test.js` → 7/7 PASS
- `npm.cmd run operations:signoff-input-assembler` → `READY_WAIT_P6_ACTUAL_CUTOVER`, input read/write 0
- `npm.cmd run check:syntax` → 279/279 PASS
- `npm.cmd run test:unit` → 429 PASS, 1 Windows-only SKIP, 0 FAIL (430 total)
- `npm.cmd run harness:verify` → PASS, 신규 assembler 포함 전체 P6/P7 준비 명령 exit 0

## 미완료 / 외부 Gate

실제 서명 receipt와 운영 증거는 생성하지 않았다. 해당 입력은 P6 G4 실제 완료 뒤 P7 운영 책임자가 8영역 증거를 검토해 승인한 경우에만 유효하다.
