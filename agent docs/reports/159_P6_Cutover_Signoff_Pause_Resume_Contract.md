# P6 Cutover 서명 중단·재개 계약 보고서

기준 시각: 2026-09-01 22:55 KST

## 1. 결과/상태

- [x] Gate 1~11 PASS를 같은 run의 signoff pause checkpoint로 고정했다.
- [x] 역할 actual 결과 3건과 identity 서명 3건이 있어야 Gate 12 재개가 열린다.
- [x] 교차 run/SHA와 rollback cutoff 이후 재개는 fail-closed 한다.
- [ ] 실제 cutover executor의 물리 checkpoint 저장·재개 연결은 다음 READY다.
- [ ] 실제 Production 전환과 P6 완료는 아니다.

## 2. 범위

- signoff pause checkpoint 생성·검증 계약
- 같은 run Gate 12 재개 판정
- cutoff·변조·누락·교차 run 실패 계약
- 합성 리허설, 단위시험, Harness 검증 등록

## 3. 보안·불변식

- [x] checkpoint는 Secret·자격증명·개인정보 원문을 포함하지 않는다.
- [x] receipt는 basename만 허용해 경로 이탈을 차단한다.
- [x] 재개 상태에서도 `productionGo=false`를 유지한다.
- [x] cutoff 이후에는 `routeDisableRequired=true`를 강제한다.
- [x] 실제 DNS·TLS·계정·프로세스·서비스 변경은 0건이다.

## 4. 검증 증거

- [x] focused 5 PASS, 0 FAIL
- [x] 구문 243개 PASS
- [x] 단위 355 PASS, 0 FAIL, Windows symlink 1 SKIP
- [x] `npm.cmd run production:cutover-signoff-resume-rehearsal`: PASS
- [x] `npm.cmd run harness:verify`: PASS

기계 증거: `agent docs/harness/P6_G4_SIGNOFF_PAUSE_RESUME_CONTRACT_EVIDENCE.json`

## 5. 실패/대체 경로

- 동일 원인 제품 실패는 발생하지 않았다.
- 누락·FAIL·경로 evidence·변경창 밖 checkpoint를 독립 실패 사례로 검증했다.
- 교차 run, SHA 변경, cutoff 초과는 모두 재개 대신 route-disable 필수 상태로 판정했다.

## 6. 미완료·외부 Gate

- 실제 물리 checkpoint 파일과 executor 재개 진입점은 아직 없다.
- 실제 역할 결과·서명·공개 HTTPS는 `NOT_RUN`이다.
- 외부 전환은 승인된 2026-09-11 20:00~23:00 KST에만 실행한다.

## 7. 다음 READY

`ACC-P6-16-CUTOVER-SIGNOFF-RESUME-RUNTIME-INTEGRATION`: checkpoint를 저장소 밖에 원자적으로 기록하고 동일 run receipt를 검증한 뒤 Gate 12만 재개하며 실패·cutoff에서 exact route-disable를 호출하는 실행 진입점을 연결한다.
