# ACC-P7-44 Bounded Operations Evidence Compiler Inputs

기준일: 2026-09-02

## 결과 / 상태

- [x] SLO·경보·백업/복원·인증서 actual 입력 bounded reader 적용
- [x] 온콜·유지보수·개선큐·운영서명 actual 입력 bounded reader 적용
- [x] 저장소 밖 절대 JSON·physical regular file·real path 강제
- [x] 파일별 1 byte 이상·4MiB 이하·JSON object 강제
- [x] symlink·reparse·parent redirect·저장소 내부·malformed/array 입력 차단
- [x] 실제 파일 bytes의 SHA-256을 영역별 evidence provenance에 사용
- [ ] 실제 P6 cutover·P7 활성화·운영 8영역 compiler 실행

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 P7 운영 증거 compiler 8개의 actual 입력 우회 경로를 닫지만 외부 측정·메시지·서명·P7 상태 전환을 수행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | 운영 증거 compiler 8개의 actual 입력 경계만 보완 |
| 산출물 | PASS | 공통 bounded physical JSON reader와 compiler별 계약 테스트 |
| 검증 | PASS | failure-first 8/8, focused 64/64, 전체 596 PASS·5 SKIP |
| 보안 | PASS | external physical path·4MiB·JSON object·redacted 오류 fail-closed |
| 추적성 | PASS | 큐·Harness·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `feac46a…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 cutover·P7 활성화·실제 운영 증거 생성 미실행 |

## 검증 증거

- failure-first → compiler 8개가 공통 bounded reader를 사용하지 않아 8/8 EXPECTED FAIL
- focused → compiler 계약과 기존 8영역 회귀 64/64 PASS
- 여덟 기본 진입점 → 모두 P6 완료 대기, evidence 생성 0건, `productionGo=false`
- `npm.cmd run check` → 구문 345/345, 단위 596 PASS·5 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33577241501`, tested SHA `feac46aa563b192fdac8737a8e81840660d35c74` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

P6 actual cutover 후 P7이 활성화되고 각 영역의 실제 입력이 생성되어야 compiler가 저장소 밖 actual evidence를 쓸 수 있다. bounded reader PASS는 운영 증거·서명이나 Production GO를 대신하지 않는다.
