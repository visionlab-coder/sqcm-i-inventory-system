# ACC-P7-63 Backup/Restore Pair Publication Integrity

기준일: 2026-09-02

## 결과 / 상태

- [x] backup·restore 두 출력 모두 공용 fsync·hard-link no-replace writer 사용
- [x] 두 번째 출력 경쟁 시 첫 번째 출력과 경쟁자 출력을 삭제·덮어쓰기 없이 보존
- [x] 1/2 게시를 `OUTPUT_PAIR_PARTIAL_COMMIT:1_OF_2`로 명시 탐지
- [x] 두 문서에 같은 `pairPublicationId`·source SHA·owner 참조 결합
- [x] 인수 finalizer가 혼합된 backup·restore 증거쌍을 fail-closed
- [x] 전체 품질·합성 운영 증거 파이프라인·Harness 재검증
- [ ] P6 실제 공개 전환과 P7 실제 운영 활성화

서로 다른 두 최종 경로에 일반 파일시스템 호출만 사용하는 경우 전체 또는 0건의 진정한 원자 게시를 보장할 수 없다. 기존 구현은 두 번째 rename 경쟁 실패 뒤 첫 번째 경로를 이름만 보고 삭제해 경쟁자가 교체한 파일까지 지울 수 있었다. 이번 보완은 각 출력에 create-only no-replace를 적용하고, 첫 출력 게시 뒤 두 번째가 충돌하면 어떤 최종 파일도 삭제하지 않은 채 명시적인 부분 게시 오류로 중단한다. 이후 재개·인수 과정은 두 문서의 동일한 pair provenance가 없으면 완료로 승격하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | backup·restore 증거쌍 publication race와 인수 결합 검증만 수정 |
| 산출물 | PASS | pair writer·provenance·finalizer 역조건·경쟁 회귀·기계 증거 |
| 검증 | PASS | focused 21 total·20 PASS·1 SKIP, 전체 776 total·768 PASS·8 SKIP·0 FAIL |
| 보안 | PASS | fsync·hard-link no-replace·부분 게시 보존·혼합 증거 fail-closed |
| 추적성 | PASS | 구현 SHA·CI run·activation bundle SHA·pairPublicationId 계약 연결 |
| Git·Rollback | PASS | 구현 commit `438aaae`; exact 4파일 commit·원격 CI 성공 |
| 외부 Gate | WAIT | P6 actual cutover와 P7 actual 운영 증거·책임자 승인 필요 |

## 검증 증거

- 집중 회귀 → 21 total·20 PASS·1 Windows symlink SKIP·0 FAIL
- 경쟁 회귀 → own backup과 competitor restore bytes 모두 보존, 임시파일 0건, 명시적 1/2 오류
- 인수 역조건 → 다른 `pairPublicationId`의 backup·restore 결합 거부
- `npm.cmd run check` → 구문 399/399, 단위 776 total·768 PASS·8 SKIP·0 FAIL
- `npm.cmd run operations:evidence-pipeline-rehearsal` → 8 compiler·10문서 PASS, synthetic only
- `npm.cmd run operations:activation-bundle-digest` → 21 roots·52 physical files·351,691 bytes·SHA-256 `b9e504a40e00c4d130e7996004a9d400489d456ff978734050e57f18549293da`
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS
- `production:cutover-preflight` → `READY_WAIT_CHANGE_WINDOW`, local blocker 0, 3서비스 healthy, 보호 서비스 보존
- GitHub-hosted quality run `33622260422`, commit `438aaae` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 이번 PASS는 P7 증거 게시·인수 무결성 준비이며 실제 backup·restore 실행 증거나 운영 활성화가 아니다.
- 두 별도 최종 파일의 all-or-zero 원자성을 주장하지 않는다. 부분 게시 상태는 보존·탐지되며 동일 pair provenance 검증 전에는 인수 완료가 아니다.
- 실제 DNS/TLS·역할 UAT·P6 서명·P7 운영 책임자 승인·외부 메시지는 수행하지 않았다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
