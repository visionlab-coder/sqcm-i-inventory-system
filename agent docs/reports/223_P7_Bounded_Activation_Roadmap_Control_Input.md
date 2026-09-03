# ACC-P7-55 Bounded Activation Roadmap Control Input

기준일: 2026-09-02

## 결과 / 상태

- [x] 네 activation 진입점의 direct unbounded roadmap read 제거
- [x] exact repository `agent docs/harness/MASTER_ROADMAP.json`만 허용
- [x] physical root/file과 exact realpath 강제
- [x] 1 byte~1MiB 및 actual bytes 검증
- [x] read 전후 root/file identity·realpath·size 안정성 재검증
- [x] fatal UTF-8와 JSON object-only 계약 적용
- [x] 과대·중간 변경·realpath redirect·invalid UTF-8·array 입력 검증
- [ ] P6 actual cutover 후 실제 19단계 Operations activation

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 activation 권한 판정에 쓰는 로컬 기계 정본의 읽기 경계만 강화하며 Production child, 승인·서명, Secret 사용, DNS/TLS 또는 외부 변경을 수행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | activation Phase control JSON read 경계만 보완 |
| 산출물 | PASS | 공용 bounded reader, 네 진입점 연결, 공격 회귀 테스트 |
| 검증 | PASS | failure-first 6/6, focused 36/36, 전체 647 PASS·7 SKIP |
| 보안 | PASS | exact path·physical·realpath·1MiB·read 안정성·fatal UTF-8·object-only |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `e950308…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 actual cutover·P7 활성화·실제 19단계 activation 미실행 |

## 검증 증거

- failure-first → 공용 reader 부재와 네 direct unbounded read 때문에 6/6 EXPECTED FAIL
- focused activation regression → 36 PASS·0 FAIL
- `npm.cmd run operations:activation-bundle-digest` → 21 roots·49 physical files·341,850 bytes·SHA-256 `e43432bec3c31e9fce6f8b8928ddbc83470739daac43e70c470cc4b76ddb9448`
- 네 실제 진입점 → 모두 `READY_WAIT_P6_ACTUAL_CUTOVER`, input·child·lease·receipt·write 0건
- `npm.cmd run check` → 구문 360/360, 단위 647 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33585841983`, tested SHA `e95030874faae9119fd849d1f32d8890f896ca2a` → unit·three-tier-integration SUCCESS

단위 전체 재검사 중 기존 backup/restore streaming 3초 시험이 시스템 지연으로 한 번 timeout 됐으나, 동일 시험 단독 5/5와 즉시 전체 647 PASS·7 SKIP로 재현되지 않았다. 변경 대상과 무관하며 동일 실패 반복 횟수는 1회다.

## 미완료 / 외부 Gate

실제 activation은 P6 G4 actual evidence, P7 활성화, Production GO, 외부 OPERATIONS_OWNER MFA 승인과 저장소 밖 receipt root가 모두 준비된 뒤 실행한다. bounded control input과 합성 rehearsal은 실제 운영 활성화 증거를 대신하지 않는다.
