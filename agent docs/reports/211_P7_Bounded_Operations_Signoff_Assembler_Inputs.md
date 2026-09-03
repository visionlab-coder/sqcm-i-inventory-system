# ACC-P7-43 Bounded Operations Signoff Assembler Inputs

기준일: 2026-09-02

## 결과 / 상태

- [x] P6 actual cutover 문서 1건의 저장소 밖 절대 JSON 경로 강제
- [x] 운영 8영역 실제 증거 문서의 동일 bounded reader 적용
- [x] OPERATIONS_OWNER 승인 receipt의 동일 bounded reader 적용
- [x] physical regular file·real path·1 byte 이상·4MiB 이하 강제
- [x] symlink·reparse·parent redirect·저장소 내부·malformed/array 입력 차단
- [x] 실제 bytes·SHA-256을 signoff 조립 provenance에 사용
- [ ] 실제 P6 cutover·운영 8영역 증거·OPERATIONS_OWNER 승인·운영 서명 조립

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 운영 서명 조립기의 10개 actual 입력 우회 경로를 닫지만 외부 승인·서명·P7 상태 전환을 수행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | Operations signoff assembler의 10개 actual 입력 경계만 보완 |
| 산출물 | PASS | 공통 bounded physical JSON reader 적용과 failure-first 회귀 |
| 검증 | PASS | failure-first 1/1, focused 13 PASS·1 SKIP, 전체 588 PASS·5 SKIP |
| 보안 | PASS | external physical path·4MiB·JSON object·redacted 오류 fail-closed |
| 추적성 | PASS | 큐·Harness·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `8e6449c…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 cutover·운영 증거·OPERATIONS_OWNER receipt·실제 서명 미실행 |

## 검증 증거

- failure-first → 실제 assembler가 공통 bounded reader를 사용하지 않아 1/1 EXPECTED FAIL
- focused → reader·signoff assembler 13 PASS·1 Windows symlink SKIP·0 FAIL
- 기본 진입점 → `READY_WAIT_P6_ACTUAL_CUTOVER`, input read·output·외부 변경 0건
- `npm.cmd run check` → 구문 344/344, 단위 588 PASS·5 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33576479233`, tested SHA `8e6449cf851198b2270108cf1385d60bbf9fedb9` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

승인된 변경창에서 P6 actual cutover가 완료되고 운영 8영역 실제 증거와 별도 OPERATIONS_OWNER 승인 receipt가 생긴 뒤에만 실제 signoff input을 조립한다. bounded reader PASS는 승인이나 Production GO를 대신하지 않는다.
