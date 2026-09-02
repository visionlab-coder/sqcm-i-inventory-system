# ACC-P6-77 Production Cutover Ingress Orphan Containment

기준일: 2026-09-02

## 결과 / 상태

- [x] ingress publication 실패와 후속 public probe 실패를 구분
- [x] ingress publication 자체 실패에만 orphan recovery를 조건부 실행
- [x] `route-disable → ingress-orphan-recovery` 순서 고정
- [x] 두 step의 exact PASS 상태와 evidence를 모두 요구
- [x] recovery WAIT·FAIL·빈 evidence는 containment PASS로 승격하지 않음
- [x] 기존 12 Gate·정상 성공 경로 14 step 유지
- [ ] 실제 변경창 cutover·DNS/TLS·orphan 복구·Production 서명

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 cutover 실패 containment 연결만 변경 |
| 산출물 | PASS | conditional recovery adapter·orchestrator 판정·failure-first 테스트 |
| 검증 | PASS | focused 29 PASS·1 SKIP, 전체 836 PASS·8 SKIP |
| 보안 | PASS | recovery 대상 확대 없음, Secret 기록 0, 외부 mutation 0 |
| 추적성 | PASS | 구현 `73cfba8`, GitHub quality `33642846184` |
| Git·Rollback | PASS | exact 구현 4파일, 정상 12 Gate/14 step 불변 |
| 외부 Gate | WAIT | 2026-09-11 변경창·자격증명 reference·실제 역할/서명 필요 |

## 검증 증거

- failure-first → 기존 route-disable 단독 판정에서 3건 실패 재현
- focused cutover·adapter·runner → 29 PASS·1 Windows 환경 SKIP·0 FAIL
- `production:cutover-adapter-rehearsal` → 12 Gate·14 step PASS
- `production:cutover-process-runner-rehearsal` → 26 receipt PASS
- `production:cutover-execute` → dry-run PASS, child/external mutation 0
- `production:ingress-orphan-recovery-preflight` → `PASS_NO_INGRESS_PARTIAL_STATE`
- 구문 검사 → 412/412 PASS
- 단위시험 → 844 total·836 PASS·8 SKIP·0 FAIL
- `npm.cmd run harness:verify` → PASS
- GitHub-hosted quality run `33642846184` → unit·three-tier-integration SUCCESS
- Production Docker → frontend/backend/database 3서비스 healthy, backend/database host port 0

## 미완료 / 외부 Gate

- 실제 DNS/TLS 게시, tunnel 생성·삭제, 역할 UAT, Production 서명은 수행하지 않았다.
- 조건부 복구는 `health_readiness`의 `ingress-publication` step 자체가 실패한 경우에만 실행한다. 그 이후 public probe 실패는 기존 route-disable 격리를 유지한다.
- 실제 복구는 별도 복구 실행기의 exact orphan·변경창·confirmation·single-writer 계약을 그대로 통과해야 한다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
