# ACC-P7-42 Bounded Activation Approval Chain Inputs

기준일: 2026-09-02

## 결과 / 상태

- [x] P6 actual evidence·unsigned request·MFA receipt·activation manifest의 저장소 밖 절대 JSON 경로 강제
- [x] physical regular file·real path 일치 강제
- [x] symlink·reparse·parent redirect·저장소 내부 차단
- [x] 파일별 1 byte 이상·4MiB 이하 bounded read
- [x] JSON object·actual bytes·SHA-256 검증
- [x] approval request·manifest·read-only preflight·activation orchestrator와 receipt 재개 읽기에 동일 reader 적용
- [ ] 실제 P6 cutover·OPERATIONS_OWNER MFA 승인·P7 activation 실행

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 P7 실제 활성화 전 승인 체인의 파일 입력 우회 경로를 닫지만 외부 승인·서명·child 실행·P7 상태 전환을 수행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P7 activation 승인 체인과 재개 receipt 입력 경계만 보완 |
| 산출물 | PASS | bounded physical JSON reader, 실제 진입점 4개 공통 적용, failure-first 회귀 |
| 검증 | PASS | failure-first 5/5, focused 42 PASS·1 SKIP, 전체 587 PASS·5 SKIP |
| 보안 | PASS | external physical path·4MiB·JSON object·redacted 오류 fail-closed |
| 추적성 | PASS | 큐·Harness·상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `5a95759…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 cutover·MFA 승인 receipt·P7 activation·운영 서명 미실행 |

## 검증 증거

- failure-first → bounded activation input reader 미구현 5/5 EXPECTED FAIL
- focused → 승인 체인·orchestrator 42 PASS·1 Windows symlink SKIP·0 FAIL
- 네 기본 진입점 → 모두 `READY_WAIT_P6_ACTUAL_CUTOVER`, input read·child·lease·receipt·외부 변경 0건
- `npm.cmd run check` → 구문 344/344, 단위 587 PASS·5 SKIP·0 FAIL
- `npm.cmd run repository:hygiene` → 고정 자격증명 0
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33575672898`, tested SHA `5a9575981623972c00d7ccbd127f8b137d22f58a` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

승인된 변경창에서 P6 actual cutover가 완료된 뒤에만 실제 approval request·별도 OPERATIONS_OWNER MFA receipt·manifest·read-only preflight·19단계 activation을 순서대로 실행한다. bounded reader PASS는 승인이나 Production GO를 대신하지 않는다.
