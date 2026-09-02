# ACC-P7-47 Bounded SLO Ledger Input

기준일: 2026-09-02

## 결과 / 상태

- [x] SLO JSONL 원장을 저장소 밖 physical 파일로 제한
- [x] 64KiB 상한·fatal UTF-8·actual bytes·SHA-256 검증
- [x] 저장소 내부·symlink/reparse·parent redirect·과대 입력 차단
- [x] P6 actual cutover 전 원장 content read 0건 보장
- [x] append와 30일 export 재읽기에 동일 bounded reader 적용
- [x] 실패 우선·집중·전체 Harness 회귀검증
- [ ] 실제 Production SLO 표본 수집

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 P7 SLO 원장 입력 경계를 닫지만 실제 원장·공개 HTTPS를 읽거나 표본·export를 쓰지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | SLO JSONL 원장의 읽기 경계와 pre-gate 무읽기만 보완 |
| 산출물 | PASS | 공통 bounded text reader, SLO ledger reader, 직접 회귀 테스트 |
| 검증 | PASS | failure-first 3/3, focused 16 PASS·2 SKIP, 전체 606 PASS·6 SKIP |
| 보안 | PASS | external physical path·64KiB·fatal UTF-8·원문 비노출 fail-closed |
| 추적성 | PASS | 큐·Harness·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `577a159f…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 cutover·P7 활성화·30일 실제 Production 수집 미실행 |

## 검증 증거

- failure-first → bounded text reader·SLO ledger reader·pre-gate 무읽기 적용 전 3/3 EXPECTED FAIL
- focused → 18 tests, 16 PASS·Windows symlink 2 SKIP·0 FAIL
- 기본 진입점 → `READY_WAIT_P6_ACTUAL_CUTOVER`, `sampleCount=0`, HTTP read·write 0건
- `npm.cmd run check` → 구문 348/348, 단위 606 PASS·6 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33579205342`, tested SHA `577a159307f39b783d214ab70863ea40702fa9ec` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

P6 actual cutover·P7 활성화·Production GO·저장소 밖 원장/export 경로·정확한 실행 확인이 모두 있어야 실제 표본 수집이 열린다. bounded reader PASS는 30일 실제 운영 측정 증거를 대신하지 않는다.
