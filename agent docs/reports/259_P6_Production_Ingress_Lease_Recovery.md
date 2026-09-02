# ACC-P6-68 Production Ingress Lease Recovery

기준일: 2026-09-02

## 결과 / 상태

- [x] stale ingress lease를 읽기 전용으로 판정하는 dry-run 제공
- [x] active owner PID 또는 5분 미만 lease는 복구 차단
- [x] 실제 복구는 승인 변경창과 exact confirmation을 모두 요구
- [x] 삭제 직전 owner PID와 물리 파일 identity를 다시 검증
- [x] 검사 뒤 교체된 lease는 삭제하지 않고 fail-closed
- [x] 기본 실행은 현재 lease 부재·외부 변경 0을 확인
- [ ] 실제 Production tunnel·DNS·TLS 게시와 역할 UAT·서명

`ACC-P6-67`은 crash로 남은 stale lease를 안전상 자동 삭제하지 않는다. 이번 Packet은 그 상태가 변경창 전체를 영구 정지시키지 않도록 별도 복구 경로를 추가하되, 자동 삭제 금지 원칙과 실제 변경창 경계를 유지한다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 ingress stale lease 복구 경로만 추가 |
| 산출물 | PASS | recovery runtime·CLI·npm/Harness 연결·회귀 6건 |
| 검증 | PASS | failure-first 5건, focused 14 PASS, 전체 788 PASS·8 SKIP |
| 보안 | PASS | Secret 미열람, owner PID·5분 age·4KiB·fatal UTF-8·물리 identity 재검증 |
| 추적성 | PASS | 구현 SHA `2f149fe`·GitHub quality `33629524930`·Harness verify 연결 |
| Git·Rollback | PASS | exact 5파일 구현 commit, dry-run 기본·삭제 전 이중 owner 검사 |
| 외부 Gate | WAIT | 변경창·Cloudflare token reference·역할 계정/MFA·실제 서명 필요 |

## 검증 증거

- failure-first → recovery 함수·진입점·npm 계약 부재로 5/5 실패 재현
- 집중 ingress 회귀 → 14 PASS·0 FAIL
- `npm.cmd run production:ingress-lease-recovery` → `PASS_INGRESS_PUBLICATION_LEASE_NOT_PRESENT`, 외부 변경 0
- `npm.cmd run check` → 구문 402/402, 단위 796 total·788 PASS·8 SKIP·0 FAIL
- `npm.cmd run production:cutover-preflight` → `READY_WAIT_CHANGE_WINDOW`, local blocker 0, 3서비스 healthy
- `npm.cmd run harness:verify` → recovery dry-run을 포함한 전체 검증 봉투 PASS·exit 0
- GitHub-hosted quality run `33629524930`, commit `2f149fe` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 실제 runtime lease 삭제는 수행하지 않았고 현재 stale lease도 존재하지 않는다.
- 이번 PASS는 변경창 장애 복구 준비이며 실제 공개 전환 증거가 아니다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
