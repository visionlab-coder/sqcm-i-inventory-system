# ACC-P7-40 Operations Activation Child Termination Diagnostics

기준일: 2026-09-02

## 결과 / 상태

- [x] 실제 Node child timeout을 `FAIL_OPERATIONS_ACTIVATION_CHILD_TIMEOUT`으로 정규화
- [x] 실제 Node child 출력 한도 초과를 `FAIL_OPERATIONS_ACTIVATION_CHILD_OUTPUT_LIMIT`으로 정규화
- [x] spawn 오류·signal·예외를 서로 다른 bounded 실패 상태로 분리
- [x] timeout 중 PASS 형태 stdout도 FAIL receipt로 기록
- [x] 오류 객체·stdout·stderr 원문은 receipt에 미기록
- [x] 정확히 식별한 failure-first 테스트 child만 정리, 보호 프로세스 변화 0
- [ ] 실제 P7 Production child 실행

공식 Phase는 P6 6/8, `productionGo=false`, P7 미착수다. 이 Packet은 동일 실패가 반복될 때 timeout·출력 한도·spawn 계층을 구분해 대체 경로를 선택할 수 있게 하는 로컬 사전준비다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | child 종료 진단만 보완, Production 실행 없음 |
| 산출물 | PASS | bounded 실패 상태 5종·기계 증거 JSON |
| 검증 | PASS | actual timeout/overflow, focused 27/27 |
| 보안 | PASS | 오류 객체와 stdout/stderr 원문 미기록 |
| 추적성 | PASS | Queue·MASTER·README·현재 상태·로드맵 동기화 |
| Git·Rollback | PASS | 최소 모듈·테스트 변경, 승인 전 bundle digest 재계산 |
| 외부 Gate | WAIT | P6 G4와 실제 P7 child는 NOT_RUN |

## 검증 증거

- failure-first → 기존 30분 고정 timeout 때문에 50ms 시험 child가 남아 결함 재현; PID·parent·command line을 확인한 해당 테스트 child만 종료
- 실제 `spawnSync` timeout → exit 1, bounded timeout status, 오류 객체 미노출
- 실제 `spawnSync` maxBuffer 초과 → exit 1, bounded output-limit status, 오류 객체 미노출
- focused orchestrator·process runner·termination tests → 27/27 PASS
- `npm.cmd run operations:activation-process-runner-rehearsal` → 19 child·19 receipt·28 physical documents·negative 4/4·Secret 0
- `npm.cmd run check` → syntax 309/309, unit 485 PASS·1 Windows symlink SKIP·0 FAIL
- activation bundle → 44 physical files, SHA-256 `0534b2fc044809d14baa1236b7342b5dfe1362c7434b6cfc9af2db8dc32816c7`
- GitHub-hosted quality run `33554401958`, tested SHA `6e6fcf1ff2a0f3aaea14fceac69bb7d1912405cf` → unit·three-tier-integration 모두 SUCCESS

## 미완료 / 외부 Gate

실제 Production activation은 수행하지 않았다. P6 G4 actual 완료·P7 활성화·Production GO·OPERATIONS_OWNER MFA 승인과 현재 bundle SHA가 결합된 뒤에만 child 실행이 열린다.
