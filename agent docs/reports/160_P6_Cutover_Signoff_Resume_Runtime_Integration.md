# P6 Cutover 서명 재개 Runtime 통합 보고서

기준 시각: 2026-09-01 23:06 KST

## 1. 결과/상태

- [x] Gate 1~11 실행 뒤 저장소 밖 물리 checkpoint를 원자적으로 기록한다.
- [x] 동일 run·release SHA의 Gate/step receipt와 SHA를 재검증한다.
- [x] 역할 결과 3건·identity 서명 3건 뒤 Gate 12만 재개한다.
- [x] cutoff·변조·Gate 실패는 exact route-disable evidence를 요구한다.
- [ ] 실제 Production cutover와 P6 완료는 아니다.

## 2. 변경 범위

- cutover 상태 머신의 `uat_signoff` 직전 중단 계약
- receipt writer의 검증된 sequence 재개
- 외부 `.checkpoint` 저장·로드·비덮어쓰기
- Gate 1~11 receipt 물리 파일·SHA 검증
- CLI `--pause-before-signoff`, `--resume-signoff`
- 물리 임시 runtime 종단 리허설

## 3. 보안·불변식

- [x] checkpoint와 receipt에 Secret·자격증명 원문을 기록하지 않는다.
- [x] checkpoint 저장소 내부 쓰기를 거부한다.
- [x] symbolic link/reparse point와 경로 evidence를 거부한다.
- [x] 교차 run/SHA·receipt 변조·누락을 차단한다.
- [x] 재개 성공 뒤에도 actual finalizer 전 `productionGo=false`다.

## 4. 검증 증거

- [x] focused 신규 계약 9 PASS, 0 FAIL
- [x] 구문 246개 PASS
- [x] 단위 364 PASS, 0 FAIL, Windows symlink 1 SKIP
- [x] 기본 cutover CLI dry-run PASS
- [x] signoff resume CLI dry-run PASS
- [x] 물리 runtime 리허설: 동일 run 11+1 Gate, 14 step, 26 receipt, checkpoint 1건 PASS

기계 증거: `agent docs/harness/P6_G4_SIGNOFF_RESUME_RUNTIME_EVIDENCE.json`

## 5. 실패/대체 경로

- checkpoint 누락·변조, receipt 수·상태·SHA·참조 불일치는 Gate 12를 실행하지 않는다.
- 22:00 cutoff 이후 재개와 Gate 12 실패는 `production:route-disable -- --execute` adapter로 전환한다.
- route-disable receipt가 없으면 격리 성공으로 승격하지 않는다.

## 6. 미완료·외부 Gate

- 실제 공개 DNS/TLS, Production 역할 사용자·MFA, 실제 identity 서명은 `NOT_RUN`이다.
- 실제 cutover actual evidence assembly와 finalizer 실패 시 자동 route-disable 연결이 남았다.
- 공개 변경은 2026-09-11 20:00~23:00 KST에만 허용된다.

## 7. 다음 READY

`ACC-P6-17-ACTUAL-EVIDENCE-FINALIZATION-AND-ROLLBACK-CONTAINMENT`: Gate 12 뒤 역할·서명·26 receipt actual evidence assembly와 finalizer를 같은 run에 연결하고, 조립·검증 실패 시 공개 route를 자동 차단한다.
