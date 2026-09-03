# ACC-P7-64 운영 활성화·인수 Lifecycle provenance 리허설

- 날짜: 2026-09-03
- Phase: P7 운영·유지보수 활성화 준비
- 상태: `[x] EVIDENCE_COMPLETE` (로컬 합성 준비), 실제 활성화·서명은 `NOT_RUN`
- 전체 진행률: `6 / 8`, `productionGo=false`

## 7범주 체크리스트

- [x] 목표·범위: 분리된 19단계 활성화와 운영 인수 10문서를 한 release·한 Production URL 경계로 연결했다.
- [x] 산출물: `operations:activation-signoff-lifecycle-rehearsal` 진입점과 Harness 검증 항목을 추가했다.
- [x] 시험: 구현 전 모듈 부재 3건 실패를 재현했고 정상 연결·release 변조·target 변조·임시파일 정리를 4/4 검증했다.
- [x] 보안: 실제 approval·child·provider·서명·외부 변경을 실행하지 않고 Secret 값을 읽거나 기록하지 않았다.
- [x] 추적성: 활성화 결과와 운영 증거 결과의 release SHA·exact target을 대조하고 불일치를 명시적 실패 코드로 닫는다.
- [x] Git·Rollback: 구현 SHA `2325b9b67a52e4abb8d2840d8aee84238e9bffb6`; 변경은 합성 리허설 전용이며 운영 상태를 바꾸지 않는다.
- [x] 외부 Gate: P6 actual cutover 뒤 실제 경보·off-site backup·restore·on-call·운영 책임자 서명이 필요하다. READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`다.

## 검증 증거

- failure-first: 신규 모듈 부재로 3 FAIL 재현
- focused: 신규 4 PASS, 기존 활성화·증거 회귀 포함 10 PASS
- `npm.cmd run check`: JavaScript 423/423, unit 885 PASS·8 SKIP·0 FAIL
- `npm.cmd run harness:verify`: PASS, P6/P7 검증 봉투에 lifecycle 리허설 등록
- GitHub Quality: run `33691770517`, unit·three-tier-integration `SUCCESS`
- 실제 Production 활성화·운영 증거·서명: `NOT_RUN`

## 남은 사실

P6 공개 전환은 2026-09-11 20:00~23:00 KST 변경창 전에는 실행할 수 없다. 현재 Phase는 P6, 완료 수는 6/8이며 `productionGo=false`다. P7 상태는 미착수로 유지한다.
