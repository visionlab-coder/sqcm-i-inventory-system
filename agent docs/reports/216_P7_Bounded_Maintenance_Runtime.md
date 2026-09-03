# ACC-P7-48 Bounded Maintenance Runtime

기준일: 2026-09-02

## 결과 / 상태

- [x] P7 maintenance Docker 명령 10초·기본 1MiB·로그 4MiB 상한 적용
- [x] container·revision·DB·JSON log 결과 엄격 파싱
- [x] Production backup manifest를 physical UTF-8 JSON object·64KiB 이하로 제한
- [x] exact Production manifest 이름과 actual bytes·SHA-256 검증
- [x] backup dump의 저장소 내부 경로·bytes·streaming SHA-256 검증
- [x] P6 operational-health와 동일 helper 공유 및 실제 loopback 회귀 PASS
- [ ] P7 활성화 후 실제 공개 HTTPS 일일점검 export 생성

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 P7 일일점검과 P6 operational-health의 runtime·backup 입력 경계를 일치시키지만 실제 P7 점검이나 외부 변경을 수행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | maintenance runtime process·backup read 경계만 보완 |
| 산출물 | PASS | 공통 bounded runtime 확장, 두 진입점 적용, 직접 회귀 테스트 |
| 검증 | PASS | failure-first 5/5, focused 21/21, 전체 611 PASS·6 SKIP |
| 보안 | PASS | timeout·buffer·physical manifest·64KiB·streaming checksum·원문 비노출 |
| 추적성 | PASS | 큐·Harness·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `69ef9767…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 cutover·P7 활성화·실제 maintenance execution 미실행 |

## 검증 증거

- failure-first → bounded manifest·latest verified backup·entrypoint 공유 전 5/5 EXPECTED FAIL
- focused → 21/21 PASS·0 FAIL
- `operations:maintenance-runner` → `READY_WAIT_P6_ACTUAL_CUTOVER`, HTTP·runtime read·write 0건
- `production:operational-health-baseline` → health/readiness 200, counter·5xx 0, 238,533-byte backup checksum·restore PASS
- `npm.cmd run check` → 구문 349/349, 단위 611 PASS·6 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33580084906`, tested SHA `69ef9767b03a50f72e6aea3fed74e699a222aa9c` → unit·three-tier-integration SUCCESS

## 실패와 대체 해결

강화된 첫 교차검증은 같은 디렉터리의 staging `.dump.json` manifest가 Production 계약과 달라 1회 실패했다. suffix 전체를 느슨하게 허용하지 않고 `seowon-inventory-YYYYMMDDTHHMMSSZ.dump.json` exact Production 이름 규칙으로 분리했다. 공급자·비용·보안·완료 기준은 변경하지 않았고 재검증은 PASS했다.

## 미완료 / 외부 Gate

P6 actual cutover·P7 활성화·Production GO·운영자/일정 참조·저장소 밖 신규 output·정확한 확인이 모두 있어야 실제 일일점검이 열린다. loopback PASS는 post-cutover 공개 점검 증거를 대신하지 않는다.
