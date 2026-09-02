# ACC-P7-56 Atomic Activation External Input Snapshot

기준일: 2026-09-02

## 결과 / 상태

- [x] external input actual bytes read 뒤 repository identity·realpath 재검증
- [x] actual bytes read 뒤 candidate identity·realpath·size 재검증
- [x] 읽기 중 크기 변경과 동일 크기 파일 교체 차단
- [x] 읽기 중 repository root redirect 차단
- [x] JSON fatal UTF-8 decode 적용
- [x] 기존 4MiB JSON·64KiB text/Secret 상한 보존
- [x] 오류에 경로·내용·Secret 원문 비노출
- [ ] P6 actual cutover 후 실제 19단계 Operations activation

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 승인·receipt·control·Secret 입력의 스냅샷 무결성만 강화하며 Production child, 승인·서명, Secret 사용, DNS/TLS 또는 외부 변경을 수행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | 공용 external input snapshot 경계만 보완 |
| 산출물 | PASS | atomic reader와 변조·encoding 회귀 테스트 |
| 검증 | PASS | failure-first 5/5, focused 16 PASS·2 SKIP, 전체 652 PASS·7 SKIP |
| 보안 | PASS | post-read identity/realpath/size·fatal UTF-8·원문 비노출 |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `37a3541…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 actual cutover·P7 활성화·실제 19단계 activation 미실행 |

## 검증 증거

- failure-first → post-read 재검증과 fatal JSON UTF-8 부재 때문에 5/5 EXPECTED FAIL
- focused input regression → 16 PASS·2 Windows symlink SKIP·0 FAIL
- `npm.cmd run operations:activation-bundle-digest` → 21 roots·49 physical files·343,397 bytes·SHA-256 `95b2c494627dbd33899e668a97b0edc6bfa19ba4d670b3af56bb2a3b3b8f431e`
- approval pipeline·approval-to-orchestrator rehearsal → PASS, 변조 6건 차단
- `npm.cmd run operations:activation-orchestrator` → `READY_WAIT_P6_ACTUAL_CUTOVER`, child·lease·receipt 0건
- `npm.cmd run check` → 구문 361/361, 단위 652 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33586665241`, tested SHA `37a35417277ad993da05bf4027f5f936f0b38046` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

실제 activation은 P6 G4 actual evidence, P7 활성화, Production GO, 외부 OPERATIONS_OWNER MFA 승인과 저장소 밖 receipt root가 모두 준비된 뒤 실행한다. atomic input snapshot과 합성 rehearsal은 실제 운영 활성화 증거를 대신하지 않는다.
