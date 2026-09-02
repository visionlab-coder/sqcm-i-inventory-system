# ACC-P7-49 Bounded Backup Restore Runtime

기준일: 2026-09-02

## 결과 / 상태

- [x] Production container discovery 10초 상한 적용
- [x] snapshot transaction·metadata Docker 명령 60분·60초 상한 적용
- [x] `pg_dump` 30분·`pg_restore` 60분 상한 적용
- [x] stderr 64KiB·capture 4MiB 상한과 child 강제 종료 적용
- [x] dump·restore를 파일 stream으로 연결해 전체 메모리 buffering 제거
- [x] timeout·출력 초과·spawn·signal·stream 실패 원문 비노출
- [ ] P6 완료 후 실제 off-site backup·격리 restore drill export 생성

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 P7 backup/restore 실행기의 런타임 경계만 강화하며 실제 Production read, off-site write, 격리 DB mutation 또는 외부 변경을 수행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | backup/restore Docker child의 시간·출력·stream 경계만 보완 |
| 산출물 | PASS | 공통 bounded runtime, 진입점 적용, 직접 회귀 테스트 |
| 검증 | PASS | failure-first 5/5, focused 11/11, 전체 616 PASS·6 SKIP |
| 보안 | PASS | shell=false, stderr/capture 상한, timeout kill, 오류·Secret 원문 비노출 |
| 추적성 | PASS | 큐·Harness·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `fc26a141…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 cutover·P7 활성화·실제 off-site backup/restore 미실행 |

## 검증 증거

- failure-first → runtime module과 bounded entrypoint 적용 전 5/5 EXPECTED FAIL
- focused → 11/11 PASS·0 FAIL
- `operations:backup-restore-runner` → `READY_WAIT_P6_ACTUAL_CUTOVER`, Production read·off-site write·DB mutation 0건
- `npm.cmd run check` → 구문 351/351, 단위 616 PASS·6 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33580854494`, tested SHA `fc26a14121436d3a4a4cc55343c49bf792d0a1bf` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

P6 actual cutover·P7 활성화·Production GO·승인된 별도 failure-domain root·attestation·신규 output·정확한 확인이 모두 있어야 실제 실행이 열린다. 로컬 runtime 테스트는 실제 off-site backup 또는 restore drill 증거를 대신하지 않는다.
