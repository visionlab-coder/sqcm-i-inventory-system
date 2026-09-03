# ACC-P6-37 Bounded Actual Cutover Evidence Input

기준일: 2026-09-02

## 결과 / 상태

- [x] P6 actual evidence 저장소 밖 절대 JSON 경로 강제
- [x] physical regular file·real path 일치 강제
- [x] symlink·reparse·parent redirect·저장소 내부 차단
- [x] 1 byte 이상·4MiB 이하 bounded read
- [x] JSON object·actual bytes·SHA-256 검증
- [x] finalizer와 P6→P7 promotion 동일 reader 사용
- [ ] 변경창 actual cutover evidence 생성·검증

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 최종 validator와 Phase promotion이 느슨한 파일 존재·무제한 JSON read를 사용하던 우회 경로를 닫지만 실제 cutover·상태 전환을 실행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 actual evidence 최종 입력 경계만 보완 |
| 산출물 | PASS | bounded physical reader, finalizer·promotion 연계, failure-first 회귀 |
| 검증 | PASS | failure-first 5건·1 platform skip, focused 10 PASS·1 SKIP, 전체 575 PASS·3 SKIP |
| 보안 | PASS | external physical path·4MiB·JSON object·redacted 오류 fail-closed |
| 추적성 | PASS | 큐·Harness·상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 4파일 구현 commit `91c5d66…`, 원격 quality 검증 |
| 외부 Gate | WAIT | actual cutover evidence 미생성, 변경창 대기 |

## 검증 증거

- failure-first → bounded actual evidence reader 미구현 5/5 EXPECTED FAIL·Windows symlink 1 SKIP
- focused → reader·기존 12-Gate validator 10 PASS·1 SKIP·0 FAIL
- `npm.cmd run production:cutover-finalizer` → `READY_WAIT_ACTUAL_CUTOVER_EVIDENCE`
- `npm.cmd run production:phase-promotion` → `READY_WAIT_ACTUAL_CUTOVER_EVIDENCE_FOR_PHASE_PROMOTION`, 변경 0건
- `npm.cmd run check` → 구문 341/341, 단위 575 PASS·3 SKIP·0 FAIL
- `npm.cmd run repository:hygiene` → 고정 자격증명 0
- GitHub-hosted quality run `33573060740`, tested SHA `91c5d667d08b18403a0064edf6829fcba11f3e08` → `unit`·`three-tier-integration` SUCCESS
- `npm.cmd run harness:verify` → exit 0, cutover finalizer·phase promotion 포함 PASS

## 미완료 / 외부 Gate

승인 변경창에서 동일 run의 12 Gate·세 역할 결과·세 identity 서명을 조립한 actual evidence가 저장소 밖에 생성돼야 한다. reader PASS나 파일 SHA 계산만으로 P6 완료 또는 P7 활성화가 되지 않는다.
