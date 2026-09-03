# ACC-P7-52 Bounded Operations Preflight Manifest Input

기준일: 2026-09-02

## 결과 / 상태

- [x] 기존 상대경로 manifest 사용성 보존
- [x] `.json` physical regular file과 realpath 일치 강제
- [x] 1 byte~1MiB 크기와 actual bytes 검증
- [x] read 전후 path·size 안정성 재검증
- [x] fatal UTF-8와 JSON object-only 계약 적용
- [x] symlink/reparse·redirect·empty·oversize·malformed 입력 차단
- [ ] P6 완료 후 승인된 실제 Production provider live probe

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 provider preflight manifest 입력 경계만 강화하며 live provider probe, Secret 사용, 계정·DNS·TLS·외부 변경을 수행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | operations manifest file read·decode·parse 경계만 보완 |
| 산출물 | PASS | bounded physical manifest reader, 진입점 연결, 공격 회귀 테스트 |
| 검증 | PASS | failure-first 5/5, focused 5/5, 전체 630 PASS·6 SKIP |
| 보안 | PASS | physical·realpath·1MiB·read 안정성·fatal UTF-8·object-only·원문 비노출 |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `cffa3ad9…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 actual cutover·P7 활성화·승인된 live provider probe 미실행 |

## 검증 증거

- failure-first → bounded manifest runtime 부재와 기존 직접 read로 5/5 EXPECTED FAIL
- focused → 5/5 PASS·0 FAIL
- `operations:preflight` template → PASS, live probe 미실행
- `operations:contracts` → manifest·cutover template 계약 PASS
- `npm.cmd run check` → 구문 355/355, 단위 630 PASS·6 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33583282289`, tested SHA `cffa3ad984640b688c8fc69ab5f3bd7c6224793a` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

실제 provider probe는 P6 actual cutover·P7 활성화, 승인된 Production manifest와 외부 연결 조건이 충족된 뒤 수행한다. template manifest 검증은 실제 운영 provider 증거를 대신하지 않는다.
