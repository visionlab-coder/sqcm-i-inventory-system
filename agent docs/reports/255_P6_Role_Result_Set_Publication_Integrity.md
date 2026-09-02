# ACC-P6-64 Role Result Set Publication Integrity

기준일: 2026-09-02

## 결과 / 상태

- [x] ADMIN·MANAGER·USER 결과 출력 3개를 사전 검증
- [x] 각 출력을 fsync·hard-link no-replace로 게시
- [x] 알려진 후속 출력 충돌은 게시 0건으로 중단
- [x] 게시 중 경쟁은 `ROLE_RESULT_OUTPUT_SET_PARTIAL_COMMIT:n_OF_3`로 탐지
- [x] 경쟁 시 현재 실행과 경쟁 실행의 최종 bytes를 삭제·덮어쓰기 없이 보존
- [x] 세 역할 문서에 동일 `resultSetPublicationId`와 Gate·step provenance 결합
- [x] actual cutover assembler가 혼합 역할 결과 set을 fail-closed
- [ ] 실제 Production 역할 사용자·MFA·UAT와 P6 공개 전환

기존 writer는 임시파일 3개를 만든 뒤 replace-capable rename으로 게시해 최종 경로 경쟁자가 만든 결과를 교체할 수 있었고, 문서 자체에도 세 역할이 한 실행에서 생성됐음을 결합하는 식별자가 없었다. 이번 보완은 사전에 알 수 있는 경로 오류를 모두 검사한 뒤 출력별 create-only publication을 사용한다. 서로 다른 세 최종 파일 전체의 원자성을 주장하지 않으며, 검사 이후 실제 경쟁은 부분 게시 상태로 보존·탐지한다. P6 actual evidence assembler는 동일 run·release·core Gate receipt·role smoke step receipt·checkedAt에서 계산한 같은 set ID를 세 역할 모두에 요구한다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 역할 결과 3문서 publication race와 actual cutover 결합만 수정 |
| 산출물 | PASS | 공용 preflight·역할 결과 writer·set provenance·assembler 역조건·회귀 |
| 검증 | PASS | failure-first 3건 재현, focused 14 PASS·1 SKIP, 전체 771 PASS·8 SKIP·0 FAIL |
| 보안 | PASS | 저장소 밖 physical 경로·fsync·hard-link no-replace·혼합 set fail-closed |
| 추적성 | PASS | 구현 SHA·CI run·activation bundle SHA·Gate/step SHA 연결 |
| Git·Rollback | PASS | 구현 commit `db4091f`; exact 5파일 commit·원격 CI 성공 |
| 외부 Gate | WAIT | 실제 역할 계정·MFA·자격증명·UAT·서명과 승인된 변경창 필요 |

## 검증 증거

- failure-first → set ID 부재·혼합 set 허용·두 번째 출력 경쟁 미탐지 3건 재현
- 집중 회귀 → 15 total·14 PASS·1 Windows symlink SKIP·0 FAIL
- 사전 충돌 회귀 → 기존 MANAGER 출력 보존, ADMIN·USER 출력 0건
- 실행 중 경쟁 회귀 → 현재 ADMIN·경쟁 MANAGER bytes 보존, USER 미게시, 임시파일 0건, 명시적 1/3 오류
- `npm.cmd run check` → 구문 399/399, 단위 779 total·771 PASS·8 SKIP·0 FAIL
- `npm.cmd run production:role-result-evidence` → 입력 부재를 `READY_WAIT_PRODUCTION_ROLE_RESULT_INPUTS`로 fail-closed
- `npm.cmd run production:cutover-actual-evidence` → 입력 부재를 `READY_WAIT_ACTUAL_CUTOVER_EVIDENCE_INPUTS`로 fail-closed
- `npm.cmd run operations:activation-bundle-digest` → 21 roots·52 physical files·351,940 bytes·SHA-256 `055ee4e0d97009dac5b68d37dc17b1ab9ed3b9b9c39e13f31b1a2c47d0263a16`
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS
- GitHub-hosted quality run `33623582143`, commit `db4091f` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 이번 PASS는 P6 역할 결과의 게시·추적 무결성 준비이며 실제 역할 UAT 결과가 아니다.
- 세 별도 최종 파일의 all-or-zero 원자성을 주장하지 않는다. 부분 게시 set은 보존되며 세 역할의 동일 set provenance 검증 전에는 actual cutover로 승격되지 않는다.
- Production 역할 사용자는 현재 0명이고 자격증명 reference도 없으므로 실제 결과 생성은 `NOT_RUN`이다.
- DNS/TLS·실제 UAT·업무/보안/운영 서명·Production GO는 실행하지 않았다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
