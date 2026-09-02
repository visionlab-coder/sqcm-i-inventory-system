# ACC-P6-93 Production 실제 서명 문서 조립기

- 날짜: 2026-09-02
- Phase: P6 Production 전환
- 상태: `[x] EVIDENCE_COMPLETE` (로컬 준비), 실제 cutover·서명은 `NOT_RUN`
- 전체 진행률: `6 / 8`, `productionGo=false`

## 7범주 체크리스트

- [x] 목표·범위: 검토된 unsigned request bundle과 외부 MFA 승인 receipt 3건에서 actual 서명 JSON 3건을 조립하는 반복 수작업을 제거했다. 승인·MFA·DNS/TLS는 생성하지 않았다.
- [x] 산출물: fail-closed gate, provenance validator, create-only 3문서 writer와 `production:signoff-actual-evidence` CLI를 추가했다.
- [x] 시험: 구현 부재를 먼저 실패로 재현하고 변경창 gate, 정상 조립, bundle 불일치·receipt ID 중복 거부, 출력 사전 충돌 무변경과 Harness 등록을 5/5 통과했다.
- [x] 보안: 변경창과 exact confirmation 전에는 입력 내용을 읽지 않는다. Secret 원문을 출력하지 않고 저장소 내부·중복·기존 출력은 거부한다.
- [x] 추적성: request set·bundle SHA·run·release·서명자·signedAt·MFA provider identity·receipt ID와 receipt SHA를 actual 서명에 결박한다.
- [x] Git·Rollback: 구현 기준 SHA `f58a8d20f71eb475d3ce5fd498417acc27674fc5`; 외부 route·계정·DB 변경은 0건이며 출력 경쟁의 부분 게시를 명시적 오류로 중단한다.
- [x] 외부 Gate: 실제 receipt와 서명 생성은 승인 변경창의 물리 외부 입력이다. 다음 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`다.

## 검증 증거

- failure-first: 신규 module 부재로 focused 0/4 실패 재현
- focused: 5 PASS, 0 FAIL
- `npm.cmd run check`: JavaScript 420/420, unit 876 PASS·8 SKIP·0 FAIL
- `npm.cmd run production:signoff-actual-evidence`: `READY_WAIT_APPROVED_CHANGE_WINDOW`, input read 0, output write 0
- GitHub Quality: run `33668644886`, unit·three-tier-integration SUCCESS
- 실제 Production 승인·서명·DNS/TLS·cutover: `NOT_RUN`

## 남은 사실

승인된 변경창은 2026-09-11 20:00~23:00 KST이며 rollback cutoff는 22:00다. 변경창 안에서 외부 MFA 승인 receipt 3건이 실제로 생성된 뒤에만 조립기를 실행할 수 있다.
