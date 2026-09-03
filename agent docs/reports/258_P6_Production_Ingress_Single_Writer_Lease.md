# ACC-P6-67 Production Ingress Single-Writer Lease

기준일: 2026-09-02

## 결과 / 상태

- [x] 실제 ingress 실행 직전에 create-only 단일 writer lease 획득
- [x] 두 번째 동시 실행은 외부 변경 전에 `READY_WAIT_INGRESS_PUBLICATION_LEASE`로 대기
- [x] 정상·오류 종료에서 자기 소유 lease만 해제
- [x] 다른 owner와 stale lease는 자동 삭제하지 않고 fail-closed
- [x] dry-run에는 lease·tunnel·DNS 변경 없음
- [ ] 실제 Production tunnel·DNS·TLS 게시와 역할 UAT·서명

기존 실행기는 두 프로세스가 같은 변경창 사전검사를 동시에 통과하면 각각 tunnel 생성과 DNS 게시를 시작할 수 있었다. 이번 보완은 공개 실행 권한을 넓히지 않고 실제 mutation 경로만 create-only lease로 직렬화한다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 actual ingress 실행 동시성 제어만 수정 |
| 산출물 | PASS | lease acquire/release·진입점 연결·회귀 3건·기계 증거 |
| 검증 | PASS | failure-first 3건, focused ingress 34 PASS, 전체 782 PASS·8 SKIP |
| 보안 | PASS | Secret 미열람, 물리 경로·4KiB 상한·fatal UTF-8·소유권 재검증 |
| 추적성 | PASS | 구현 SHA `0d9327e`·GitHub quality `33628196250`·Harness verify 연결 |
| Git·Rollback | PASS | exact 3파일 구현 commit, stale/unowned lease 자동 제거 금지 |
| 외부 Gate | WAIT | 변경창·Cloudflare token reference·역할 계정/MFA·실제 서명 필요 |

## 검증 증거

- failure-first → lease helper 2개와 진입점 연결 부재로 3/3 실패 재현
- 집중 ingress 회귀 → 34 PASS·0 FAIL
- `npm.cmd run check` → 구문 400/400, 단위 790 total·782 PASS·8 SKIP·0 FAIL
- `npm.cmd run production:ingress-publication` → 입력 대기, 외부 변경 0, 실제 ingress `NOT_RUN`
- `npm.cmd run production:cutover-preflight` → `READY_WAIT_CHANGE_WINDOW`, local blocker 0, 3서비스 healthy
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS·exit 0
- GitHub-hosted quality run `33628196250`, commit `0d9327e` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 이번 PASS는 actual ingress 실행기의 단일 writer 보장 준비이며 실제 공개 전환 증거가 아니다.
- `inventory.safe-link.co.kr` DNS/TLS와 Production tunnel은 아직 게시되지 않았다.
- Production 역할 사용자·MFA·실제 결과·서명은 준비되지 않았다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
