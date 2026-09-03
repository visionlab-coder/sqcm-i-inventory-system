# ACC-P6-70 Production Ingress Process Spawn Acknowledgement

기준일: 2026-09-02

## 결과 / 상태

- [x] cloudflared의 비동기 `spawn` 확인 전에는 시작 성공을 기록하지 않음
- [x] 시작 PID가 유효한 양의 정수일 때만 detach 성공으로 인정
- [x] 비동기 오류를 provider 원문 없이 고정 실패 코드로 축약
- [x] 5초 bounded timeout과 best-effort child 정리 적용
- [x] exact Windows executable·config·log·pid 경로와 인자를 고정
- [x] 실제 시작 PID를 실행 결과에 별도 기록
- [ ] 실제 Production tunnel process 시작과 DNS/TLS 게시

기존 진입점은 `spawn()` 반환 직후 `unref()`하고 `processStarted=true`를 기록해, 실행 파일 부재 같은 비동기 시작 오류를 성공으로 오판할 수 있었다. 이번 Packet은 `spawn` acknowledgement와 PID를 확인한 뒤에만 성공 상태를 반환하도록 fail-closed 경계를 추가했다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 ingress process 시작 acknowledgement만 강화 |
| 산출물 | PASS | 공용 async start helper·진입점 연결·회귀 5건 |
| 검증 | PASS | failure-first 5/5, focused 10 PASS, 전체 798 PASS·8 SKIP |
| 보안 | PASS | exact 인자, bounded timeout, 오류 원문 미기록, invalid PID fail-closed |
| 추적성 | PASS | 구현 `abf0d2c`·GitHub quality `33632375755` |
| Git·Rollback | PASS | exact 구현 3파일, 실제 runtime process·DNS 변경 없음 |
| 외부 Gate | WAIT | 변경창·Cloudflare token·역할 계정/MFA·실제 서명 필요 |

## 검증 증거

- failure-first → helper와 awaited 진입점 부재로 5/5 실패 재현
- 집중 process start/identity 회귀 → 10 PASS·0 FAIL
- `npm.cmd run production:ingress-publication` → 입력 대기, 외부 변경 0, actual `NOT_RUN`
- `npm.cmd run check` → 구문 404/404, 단위 806 total·798 PASS·8 SKIP·0 FAIL
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS·exit 0
- 보호 listener → `1234/6632`, `11434/8588`, `18765/22716`, `18766/65724` 보존
- GitHub-hosted quality run `33632375755`, commit `abf0d2c` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 실제 cloudflared process는 시작·종료하지 않았고 Production tunnel·DNS/TLS도 게시하지 않았다.
- 이번 PASS는 변경창 실행 시 spawn 성공 오판을 차단하는 준비 증거이며 실제 공개 전환 증거가 아니다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
