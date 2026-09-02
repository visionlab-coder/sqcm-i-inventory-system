# ACC-P6-39 Atomic Actual Cutover Assembly Inputs

기준일: 2026-09-02

## 결과 / 상태

- [x] cutover receipt·역할 결과·서명 JSON의 공용 bounded reader 적용
- [x] 파일당 1MiB, receipt 최대 64개·합계 16MiB 상한 적용
- [x] actual bytes read 전후 repository·receipt root·candidate identity·realpath·size 재검증
- [x] 같은 크기 교체·크기 변경·root redirect·저장소 내부 입력 차단
- [x] fatal UTF-8와 JSON object-only 계약 적용
- [x] actual bytes SHA-256만 assembly provenance로 사용
- [ ] P6 실제 DNS/TLS cutover·역할 UAT·3개 서명과 actual evidence 조립

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 finalizer 직전 actual evidence assembly 입력의 무결성만 강화하며 계정·서명·Secret·DNS/TLS·Production 상태를 변경하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 actual evidence assembly 입력 경계만 보완 |
| 산출물 | PASS | bounded atomic reader와 공격 회귀 테스트 5건 |
| 검증 | PASS | failure-first 5/5, focused 25/25, 전체 666 PASS·7 SKIP |
| 보안 | PASS | root/repository/file 재검증·상한·fatal UTF-8·원문 비노출 |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `8436bb7…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | 승인된 변경창의 실제 receipt·역할 UAT·서명·assembly 미실행 |

## 검증 증거

- failure-first → atomic snapshot·상한·fatal UTF-8 부재 때문에 5/5 EXPECTED FAIL
- focused assembler/executor/role-result regression → 25 PASS·0 FAIL
- `npm.cmd run check:syntax` → 364/364 PASS
- `npm.cmd run test:unit` → 673 total·666 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- `npm.cmd run production:cutover-actual-evidence` → `READY_WAIT_ACTUAL_CUTOVER_EVIDENCE_INPUTS`, 생성 0건
- `npm.cmd run production:role-result-evidence` → `READY_WAIT_PRODUCTION_ROLE_RESULT_INPUTS`, 생성 0건
- `npm.cmd run production:cutover-finalizer` → `READY_WAIT_ACTUAL_CUTOVER_EVIDENCE`, `productionGo=false`
- `npm.cmd run production:phase-promotion` → `READY_WAIT_ACTUAL_CUTOVER_EVIDENCE_FOR_PHASE_PROMOTION`, 변경 0건
- GitHub-hosted quality run `33589230425`, tested SHA `8436bb736ea11aa9e563e4cfa02234f28a0d495d` → unit·three-tier-integration SUCCESS
- 보호 포트/PID 4건과 Production frontend/backend/database 3서비스 보존

## 미완료 / 외부 Gate

실제 P6 완료는 승인된 `2026-09-11 20:00~23:00 KST` 변경창에서 DNS/TLS 공개, 역할별 로그인·MFA·RBAC, 12개 Gate, 실제 UAT 결과 3건과 업무·보안·운영 서명 3건을 확보한 뒤에만 가능하다. 로컬 atomic assembly 검증은 실제 Production cutover 또는 7/8 승격 증거를 대신하지 않는다.
