# ACC-P7-53 Bounded Activation State Files

기준일: 2026-09-02

## 결과 / 상태

- [x] receipt-root claim 재사용의 direct unbounded JSON read 제거
- [x] single-writer lease 해제 전 direct unbounded JSON read 제거
- [x] exact receipt root·basename과 physical regular file 강제
- [x] 1 byte~64KiB 및 actual bytes 검증
- [x] read 전후 directory/file identity·realpath·size 안정성 재검증
- [x] fatal UTF-8와 JSON object-only 계약 적용
- [x] 과대 claim 거부 및 과대 lease 비삭제 검증
- [ ] P6 actual cutover 후 실제 19단계 Operations activation

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 activation 영속 상태 재읽기 경계만 강화하며 Production child, 승인·서명, Secret 사용, DNS/TLS 또는 외부 변경을 수행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | activation claim·lease state read 경계만 보완 |
| 산출물 | PASS | bounded state reader, 오케스트레이터 연결, 공격 회귀 테스트 |
| 검증 | PASS | failure-first 6/6, focused 29 PASS·1 SKIP, 전체 635 PASS·7 SKIP |
| 보안 | PASS | physical·realpath·64KiB·read 안정성·fatal UTF-8·object-only·원문 비노출 |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `d062ae6…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 actual cutover·P7 활성화·실제 19단계 activation 미실행 |

## 검증 증거

- failure-first → bounded state reader 부재와 기존 direct read 때문에 6/6 EXPECTED FAIL
- focused activation regression → 29 PASS·1 Windows symlink SKIP·0 FAIL
- `npm.cmd run operations:activation-bundle-digest` → 21 roots·48 physical files PASS
- `npm.cmd run operations:activation-orchestrator` → `READY_WAIT_P6_ACTUAL_CUTOVER`, child·lease·receipt 0건
- `npm.cmd run check` → 구문 357/357, 단위 635 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33584127768`, tested SHA `d062ae62426c3e40be97071fb5be3ffec8ee9ffa` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

실제 activation은 P6 G4 actual evidence, P7 활성화, Production GO, 외부 OPERATIONS_OWNER MFA 승인과 저장소 밖 receipt root가 모두 준비된 뒤 실행한다. 합성 rehearsal과 bounded state 검증은 실제 운영 활성화 증거를 대신하지 않는다.
