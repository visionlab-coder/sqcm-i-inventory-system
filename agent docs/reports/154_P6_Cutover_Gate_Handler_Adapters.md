# ACC-P6-10 Cutover Gate Handler Adapters

기준일: 2026-09-01
상태: **EVIDENCE_COMPLETE (synthetic local rehearsal)**
Phase 상태: **6 / 8, P6 진행 중**

## 1. 목표·범위

P6 변경창 실행 코어의 12개 Gate를 기존 Production runner 14개 step에 구조화 연결하고, 각 step의 exact 성공 상태와 evidence reference가 함께 있을 때만 Gate PASS로 변환한다. 실제 외부 명령은 실행하지 않는다.

## 2. 7범주 체크리스트

- [x] 목표·범위: 12 Gate·14 step·status-aware adapter 계약 구현
- [x] 산출물: Gate plan·handler factory·route-disable adapter·합성 runner·단위 회귀
- [x] 시험: exact 순서/인자/PASS, READY_WAIT, 빈 evidence, route-disable 대기, plan 변조
- [x] 보안: Secret 원문·외부 명령·계정·DNS·Production mutation 0건
- [x] 추적성: 가속 큐·MASTER_ROADMAP·현재 상태·로드맵·기계 증거 동기화
- [x] Git·Rollback: exact `PASS_PUBLIC_ROUTE_DISABLED`와 evidence 없이는 rollback 격리 금지
- [ ] 외부 Gate: process runner·runtime receipt writer 연결 및 P6 G4 실제 cutover는 변경창 대기

## 3. 검증 증거

- `node --test test/unit/production-cutover-gate-adapters.test.js` → **6/6 PASS**
- `npm.cmd run production:cutover-adapter-rehearsal` → **12 Gate/14 step PASS**
- `npm.cmd run check` → JavaScript **228개**, unit **333/333 PASS**
- `npm.cmd run harness:check` → 오류 **0건**
- `npm.cmd run harness:verify` → 등록 검증 **41/41 PASS**
- staging·Production Docker는 각각 `frontend`·`backend`·`database` **3서비스 healthy**, backend·database host port **0개** 유지
- 실제 명령·cutover·route-disable·외부 mutation·Production GO: **0건/false**

## 4. 판정·다음 Gate

기존 runner가 반환하는 `READY_WAIT_*`를 exit code만 보고 성공으로 오인하던 위험은 adapter 계약에서 제거됐다. 현재 adapter는 합성 step runner로 검증됐으며 실제 process 실행과 저장소 밖 receipt 기록은 `NOT_RUN`이다. 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`를 유지한다.
