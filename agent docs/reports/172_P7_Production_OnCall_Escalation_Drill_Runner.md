# ACC-P7-22 Production On-call Escalation Drill Runner

기준일: 2026-09-02

## 결과 / 상태

- [x] P6 actual 완료·P7 활성화·Production GO 전 message·Secret read·write 0건
- [x] 승인된 provider·channel·Asia/Seoul 30일 연속 당번표 계약
- [x] primary와 escalation 책임자 분리 및 수락 시각 검증
- [x] `PRIMARY → ESCALATION` 순서와 역할별 deterministic idempotency key
- [x] provider provenance·고유 ACK receipt·5분/15분 상한 검증
- [x] 기존 `operations:oncall-evidence` compiler 호환 export와 원자적 1회 기록
- [ ] 실제 운영 책임자 지정·수락
- [ ] 실제 공급자 credential 입력과 escalation drill 발송
- [ ] 실제 ACK receipt 기반 Production 증거 생성

상태는 `EVIDENCE_COMPLETE`인 로컬 준비 Packet이며, 공식 Phase는 P6 6/8과 `productionGo=false`를 유지한다. 기본 실행은 `READY_WAIT_P6_ACTUAL_CUTOVER`다.

## 실행 계약

실제 실행은 P6 증거 완료, P7 진행 중, Production GO, 저장소 밖 물리 manifest·credential, 저장소 밖 신규 output, `--send`, exact confirmation `ACK-SEND-P7-PRODUCTION-ONCALL-ESCALATION-DRILL`이 모두 있을 때만 열린다. endpoint는 공개 HTTPS만 허용하며 DNS가 private/link-local/loopback 주소를 반환하면 중단한다.

## 검증 증거

- `node --check src/operations/operations-oncall-drill-runner.mjs`
- `node --check scripts/operations-oncall-drill-runner.mjs`
- `node --test test/unit/operations-oncall-drill-runner.test.js` → 7/7 PASS
- `npm.cmd run operations:oncall-drill-runner` → `READY_WAIT_P6_ACTUAL_CUTOVER`, request/secret/write 0
- `npm.cmd run check:syntax` → 276/276 PASS
- `npm.cmd run test:unit` → 422 PASS, 1 Windows-only SKIP, 0 FAIL (423 total)
- `npm.cmd run harness:verify` → PASS, 신규 runner 포함 전체 P6/P7 준비 명령 exit 0

## 미완료 / 외부 Gate

실제 당번표 승인, 서로 다른 두 책임자의 수락, 공급자 endpoint·credential, 실제 두 단계 ACK receipt는 존재한다고 추정하지 않았다. P6 G4 실제 cutover가 닫힌 뒤 P7에서만 실행한다.
