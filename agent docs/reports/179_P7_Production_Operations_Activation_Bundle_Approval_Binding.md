# ACC-P7-29 Production Operations Activation Bundle Approval Binding

기준일: 2026-09-02

## 결과 / 상태

- [x] 오케스트레이터 entrypoint·source 포함
- [x] 19단계 child script 포함
- [x] 21개 root와 재귀 로컬 정적 의존성의 exact 상대경로·파일 bytes SHA-256 계산
- [x] symlink·reparse point·비물리 파일 거부
- [x] 승인 manifest에 activation bundle digest 결합
- [x] 승인 뒤 번들 변경을 lease·child·receipt 전에 차단
- [x] P6 actual 전 번들 read·approval read·child·write 0건
- [ ] 실제 P6 cutover와 P7 운영 활성화 실행

상태는 `EVIDENCE_COMPLETE`인 P7 사전준비 Packet이다. 공식 Phase는 P6 6/8, `productionGo=false`, P7 미착수를 유지한다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표 | PASS | 승인 뒤 실행 코드 변경 차단 |
| 범위 | PASS | P7 activation entrypoint·source·19 child만 포함 |
| 정본 | PASS | approval contract·Harness·코드 일치 |
| 권한 | PASS | local-autonomous, 외부 변경 0건 |
| 구현 | PASS | 21개 root에서 42개 물리 파일로 해석된 재귀 graph SHA-256 |
| 검증 | PASS | focused 20/20, 전체 449 PASS·1 SKIP |
| 운영 불변식 | PASS | 3서비스와 보호 listener 4건 보존 |

## 검증 증거

- 구현 전 focused test → 18 PASS, 2 EXPECTED FAIL
- 구현 후 `node --test test/unit/operations-activation-orchestrator.test.js` → 20/20 PASS
- 실제 저장소 bundle resolver → 21개 root, 42개 물리 파일
- `npm.cmd run operations:activation-bundle-digest` → 승인 manifest용 현재 SHA-256을 읽기 전용 출력
- `npm.cmd run operations:activation-orchestrator` → `READY_WAIT_P6_ACTUAL_CUTOVER`, bundle verification 0, child 0, receipt 0
- `npm.cmd run check:syntax` → 283/283 PASS
- `npm.cmd run test:unit` → 449 PASS, 1 Windows-only SKIP, 0 FAIL (450 total)
- `npm.cmd run harness:verify` → PASS
- 보호 listener → `1234/6632`, `11434/8588`, `18765/22716`, `18766/65724`

## 미완료 / 외부 Gate

실제 Production, DNS/TLS, 승인 서명, 운영 child, 메시지, DB mutation과 Secret 사용은 실행하지 않았다. P6 actual 완료 뒤 실제 승인 manifest를 생성할 때 현재 번들 SHA-256을 입력해야 하며 이후 파일 변경은 새 승인을 요구한다.
