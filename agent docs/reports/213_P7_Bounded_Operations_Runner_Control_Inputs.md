# ACC-P7-45 Bounded Operations Runner Control Inputs

기준일: 2026-09-02

## 결과 / 상태

- [x] 경보 delivery provider manifest bounded reader 적용
- [x] off-site storage approval attestation bounded reader 적용
- [x] on-call drill provider manifest bounded reader 적용
- [x] improvement queue triage attestation bounded reader 적용
- [x] 저장소 밖 절대 JSON·physical regular file·real path·4MiB 상한 강제
- [x] symlink·reparse·parent redirect·저장소 내부·malformed/array 입력 차단
- [ ] 실제 경보·백업/복원·온콜·GitHub 운영큐 실행

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 실제 운영 runner 4개의 제어 JSON 경계를 닫지만 credential 원문 계약, 외부 메시지·GitHub read·백업/복원 실행을 열지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | runner 제어 JSON 4건만 bounded reader로 보완 |
| 산출물 | PASS | 공통 reader 적용과 runner별 계약 테스트 |
| 검증 | PASS | failure-first 4/4, focused 30/30, 전체 600 PASS·5 SKIP |
| 보안 | PASS | external physical path·4MiB·JSON object·redacted 오류 fail-closed |
| 추적성 | PASS | 큐·Harness·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `ea2b84f…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 cutover·P7 활성화·credential·실제 runner 실행 미실행 |

## 검증 증거

- failure-first → 네 runner가 제어 JSON을 직접 읽어 4/4 EXPECTED FAIL
- focused → runner 계약과 기존 4영역 회귀 30/30 PASS
- 네 기본 진입점 → 모두 `READY_WAIT_P6_ACTUAL_CUTOVER`, Secret 사용·외부 변경 0건
- `npm.cmd run check` → 구문 346/346, 단위 600 PASS·5 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33577822762`, tested SHA `ea2b84fea86bd28eaee404987ebdb9620aeea804` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

P6 actual cutover와 P7 활성화 후 정확한 credential reference·승인·실행 확인이 있을 때만 네 runner의 실제 외부 동작이 열린다. bounded control input PASS는 외부 실행이나 Production GO를 대신하지 않는다.
