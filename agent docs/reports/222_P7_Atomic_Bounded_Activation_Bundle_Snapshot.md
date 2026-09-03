# ACC-P7-54 Atomic Bounded Activation Bundle Snapshot

기준일: 2026-09-02

## 결과 / 상태

- [x] dependency graph와 SHA-256의 이중 filesystem 관측 제거
- [x] 파일당 정확히 한 번 읽은 동일 in-memory snapshot 사용
- [x] physical root/file과 exact realpath 강제
- [x] 파일당 4MiB·전체 64MiB 상한 및 actual bytes 검증
- [x] read 전후 root/file identity·size 안정성 재검증
- [x] fatal UTF-8와 경로·내용 원문 비노출 계약 적용
- [x] 중간 파일 변경·과대·invalid UTF-8·root 밖 경로 공격 검증
- [ ] P6 actual cutover 후 실제 19단계 Operations activation

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 승인 대상 activation bundle의 graph와 digest가 동일 관측에서 생성되도록 강화하며 Production child, 승인·서명, Secret 사용, DNS/TLS 또는 외부 변경을 수행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | activation bundle snapshot 경계만 보완 |
| 산출물 | PASS | single-read inspector, digest CLI 연결, 공격 회귀 테스트 |
| 검증 | PASS | failure-first 6/6, focused 30/30, 전체 641 PASS·7 SKIP |
| 보안 | PASS | physical·realpath·4MiB/64MiB·read 안정성·fatal UTF-8·원문 비노출 |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `d2e032f…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 actual cutover·P7 활성화·실제 19단계 activation 미실행 |

## 검증 증거

- failure-first → atomic bounded inspector 부재와 기존 graph/digest 재읽기 때문에 6/6 EXPECTED FAIL
- focused activation regression → 30 PASS·0 FAIL
- `npm.cmd run operations:activation-bundle-digest` → 21 roots·48 physical files·337,679 bytes·SHA-256 `02ffa72693649836487e7f8635cdc331987050c826b30ea6d4c174d01f304e66`
- `npm.cmd run operations:activation-orchestrator` → `READY_WAIT_P6_ACTUAL_CUTOVER`, child·lease·receipt 0건
- `npm.cmd run check` → 구문 358/358, 단위 641 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33585003462`, tested SHA `d2e032faa21f5364c8747ec25ca9131a0c17b6fc` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

실제 activation은 P6 G4 actual evidence, P7 활성화, Production GO, 외부 OPERATIONS_OWNER MFA 승인과 저장소 밖 receipt root가 모두 준비된 뒤 실행한다. 합성 rehearsal과 bundle snapshot 검증은 실제 운영 활성화 증거를 대신하지 않는다.
