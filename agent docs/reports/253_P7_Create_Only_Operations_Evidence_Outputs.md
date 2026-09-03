# ACC-P7-62 Create-only Operations Evidence Outputs

기준일: 2026-09-02

## 결과 / 상태

- [x] P7 단일 운영 증거 writer 16개를 공용 create-only publication으로 통합
- [x] 임시파일 fsync 뒤 hard-link no-replace로 최종 경로 게시
- [x] 경쟁자가 최종 경로를 선점하면 기존 bytes 보존
- [x] physical output directory와 임시파일 정리 강제
- [x] 운영 증거 10문서 합성 파이프라인·활성화 번들·Harness 재검증
- [ ] P6 실제 공개 전환과 P7 실제 운영 활성화

기존 SLO·경보·backup/restore drill·인증서·온콜·정비·개선 큐·운영 서명·인수 단일 문서 writer는 `existsSync` 확인 뒤 replace-capable `renameSync`를 사용했다. 경쟁 시 이미 생성된 증거를 바꿀 수 있었으므로, 승인·활성화 receipt에서 사용하던 hard-link no-replace 의미를 공용 writer로 적용했다. 문서 schema와 외부 Gate는 변경하지 않았다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | 단일 문서 운영 증거 16개 publication race만 수정 |
| 산출물 | PASS | 공용 create-only writer·채택 계약·경쟁 회귀·기계 증거 |
| 검증 | PASS | focused 110 PASS·1 SKIP, 전체 766 PASS·8 SKIP·0 FAIL |
| 보안 | PASS | fsync·hard-link no-replace·physical parent·기존 bytes 보존 |
| 추적성 | PASS | 구현 SHA·CI run·activation bundle SHA 연결 |
| Git·Rollback | PASS | 구현 commit `a3a9494`; exact 19파일 commit·원격 CI 성공 |
| 외부 Gate | WAIT | P6 실제 cutover와 P7 실제 운영 증거·책임자 승인 필요 |

## 검증 증거

- 공용 writer 회귀 → 경쟁 선점 시 `OUTPUT_ALREADY_EXISTS`, 기존 bytes 보존, 임시파일 0건
- 채택 계약 → 대상 16개 writer 모두 공용 writer 사용·replace-capable `renameSync` 0건
- 집중 운영 writer 회귀 → 111 total·110 PASS·1 Windows symlink SKIP
- `npm.cmd run check` → 구문 399/399, 단위 774 total·766 PASS·8 SKIP·0 FAIL
- `npm.cmd run operations:evidence-pipeline-rehearsal` → 8 compiler·10문서 PASS, synthetic only
- `npm.cmd run operations:activation-bundle-digest` → 21 roots·52 physical files·351,336 bytes·SHA-256 `061d7ed0cece1f15d5555e91b1109ad5911598d19de46d50d5eb5d80b59d1c8f`
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS
- `production:cutover-preflight` → `READY_WAIT_CHANGE_WINDOW`, local blocker 0, 3서비스 healthy, 보호 서비스 보존
- GitHub-hosted quality run `33620934459`, commit `a3a9494` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 이번 PASS는 P7 출력 무결성 준비 증거이며 실제 운영 증거나 활성화가 아니다.
- backup·restore 2문서 동시 조립 함수는 기존 별도 all-or-zero 계약을 유지하며 이번 단일 문서 범위에 포함하지 않았다.
- 실제 DNS/TLS·역할 UAT·P6 서명·P7 운영 책임자 승인·외부 메시지는 수행하지 않았다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
