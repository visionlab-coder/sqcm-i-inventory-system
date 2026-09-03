# ACC-P6-65 Cutover Control Output Durability

기준일: 2026-09-02

## 결과 / 상태

- [x] actual cutover 최종 증거를 fsync·hard-link no-replace로 게시
- [x] Gate 1~11 signoff pause checkpoint를 같은 durable writer로 게시
- [x] 12-Gate step·summary receipt를 같은 durable writer로 게시
- [x] 최종 경로 경쟁 시 선점 bytes 보존·임시파일 제거
- [x] 출력별 충돌 오류 코드를 fail-closed로 정규화
- [x] 12-Gate process runner와 signoff pause/resume 물리 리허설 재검증
- [ ] 실제 Production 역할 UAT·서명·DNS/TLS 전환

세 P6 control writer는 최종 파일을 `wx`로 직접 열어 덮어쓰기는 막았지만, 임시파일 fsync 뒤 no-replace publication 계약과 최종 경로 경쟁 회귀가 없었다. 이번 보완은 기존 저장소 밖·물리 경로·확장자 검사를 유지하면서 공용 create-only writer를 사용하도록 통합했다. 각 문서는 동일 디렉터리에 fsync된 임시파일을 만든 뒤 hard-link로 게시하므로 경쟁자가 최종 경로를 먼저 만들면 그 bytes를 교체하지 않고 임시파일을 제거한다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 actual evidence·checkpoint·receipt publication만 수정 |
| 산출물 | PASS | 세 writer·충돌 정규화·경쟁 회귀·기계 증거 |
| 검증 | PASS | failure-first 6건 재현, focused 22 PASS·2 SKIP, 전체 774 PASS·8 SKIP·0 FAIL |
| 보안 | PASS | 저장소 밖/물리 경로 유지·fsync·hard-link no-replace·선점 bytes 보존 |
| 추적성 | PASS | 구현 SHA·CI run·activation bundle SHA·12-Gate 리허설 연결 |
| Git·Rollback | PASS | 구현 commit `fa4964d`; exact 6파일 commit·원격 CI 성공 |
| 외부 Gate | WAIT | 실제 역할 계정·MFA·UAT·서명과 승인된 변경창 필요 |

## 검증 증거

- failure-first → 세 writer의 정규화 충돌 코드 부재 3건·경쟁 무탐지 3건 재현
- 집중 회귀 → 24 total·22 PASS·2 Windows symlink SKIP·0 FAIL
- 세 경쟁 회귀 → actual evidence·checkpoint·receipt 각각 경쟁자 bytes 보존, 임시파일 0건
- `npm.cmd run check` → 구문 399/399, 단위 782 total·774 PASS·8 SKIP·0 FAIL
- `npm.cmd run production:cutover-process-runner-rehearsal` → 12 Gate·14 step·26 receipt PASS, synthetic only
- `npm.cmd run production:cutover-signoff-resume-runtime-rehearsal` → Gate 11+1·14 step·26 receipt·checkpoint 1건 PASS, synthetic only
- `npm.cmd run production:cutover-actual-evidence` → 입력 부재를 `READY_WAIT_ACTUAL_CUTOVER_EVIDENCE_INPUTS`로 fail-closed
- `npm.cmd run operations:activation-bundle-digest` → 21 roots·52 physical files·352,075 bytes·SHA-256 `0601edb0a824c3564a206b3b8d163ead872c0cda3da8ed368990444e5bc7a880`
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS
- GitHub-hosted quality run `33624966275`, commit `fa4964d` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 이번 PASS는 P6 cutover control 출력의 crash·race 내구성 준비이며 실제 전환 증거가 아니다.
- 리허설은 합성 물리파일만 사용했고 실제 DNS/TLS·역할 UAT·서명을 실행하지 않았다.
- Production 역할 사용자는 현재 0명이며 필요한 다섯 외부 reference도 준비되지 않았다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
