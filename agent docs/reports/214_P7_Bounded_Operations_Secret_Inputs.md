# ACC-P7-46 Bounded Operations Secret Inputs

기준일: 2026-09-02

## 결과 / 상태

- [x] 경보 delivery API token 공통 Secret reader 적용
- [x] on-call drill API token 공통 Secret reader 적용
- [x] GitHub operations queue token 공통 Secret reader 적용
- [x] 저장소 밖 절대경로·physical regular file·real path 강제
- [x] 1 byte 이상·64KiB 이하·fatal UTF-8·비어 있지 않은 값 강제
- [x] symlink·reparse·parent redirect·저장소 내부·invalid UTF-8 차단
- [x] 오류·증거·로그에서 Secret 원문 비노출
- [ ] 실제 credential 입력·외부 runner 실행

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 세 P7 runner의 Secret 파일 읽기 경계를 닫지만 실제 credential을 읽거나 출력하지 않고 외부 메시지·GitHub read도 수행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P7 runner Secret 파일 3건의 읽기 경계만 보완 |
| 산출물 | PASS | 공통 64KiB Secret reader, 세 runner 적용, 직접 회귀 테스트 |
| 검증 | PASS | failure-first 4/4, focused 28 PASS·2 SKIP, 전체 603 PASS·6 SKIP |
| 보안 | PASS | external physical path·64KiB·fatal UTF-8·원문 비노출 fail-closed |
| 추적성 | PASS | 큐·Harness·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `5572b2f…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 cutover·P7 활성화·실제 credential·runner 실행 미실행 |

## 검증 증거

- failure-first → Secret reader·세 runner 적용 전 4/4 EXPECTED FAIL
- focused → 기존 JSON reader·세 runner·Secret reader 28 PASS·Windows symlink 2 SKIP
- 세 기본 진입점 → 모두 `READY_WAIT_P6_ACTUAL_CUTOVER`, Secret read·외부 변경 0건
- `npm.cmd run check` → 구문 347/347, 단위 603 PASS·6 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33578500294`, tested SHA `5572b2f4553f73360159189e9ae70ba47234a3a7` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

P6 actual cutover·P7 활성화와 정확한 credential reference·실행 확인이 모두 있어야 실제 Secret read가 열린다. bounded reader PASS는 자격증명 제공이나 외부 실행 승인을 대신하지 않는다.
