# ACC-P6-60 Remote Commit Content Attestation

기준일: 2026-09-02

## 결과 / 상태

- [x] 역사적 P2 candidate manifest와 실제 원격 후보 commit blob을 byte 단위 대조
- [x] 12개 해시 파일 중 7개 일치·5개 불일치를 별도 attestation에 보존
- [x] 역사적 manifest 원본을 수정하지 않고 `deploymentBasis=false` 강제
- [x] Git metadata 1MiB·파일당 8MiB·합계 64MiB·10초 timeout·shell 금지
- [x] cutover preflight 외부 변경 0건·`productionGo=false`
- [ ] 승인 변경창에서 actual 12-Gate·역할 UAT·3종 서명 실행

공식 Phase는 P6 `6/8`이다. P2 릴리스 후보 manifest가 주장한 12개 content hash 중 5개가 후보 commit `cfed57c…`의 실제 blob과 달랐으나 기존 Harness는 경로와 parent만 검사했다. 이번 Packet은 실제 commit content 12개·66,547 bytes를 다시 hash하고 별도 attestation과 대조한다. 불일치는 역사적 증거 결함으로 보존하며 현재 P6 배포 후보의 근거로 승격하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | 역사적 P2 remote commit content provenance를 실제 Git object로 재검증 |
| 산출물 | PASS | remote content verifier·atomic control snapshot·attestation·failure-first 회귀 |
| 검증 | PASS | failure-first 5/5, focused 8/8, 전체 763 PASS·7 SKIP |
| 보안 | PASS | bounded Git·경로 정규화·SHA 고정·불일치 deployment basis 금지 |
| 추적성 | PASS | candidate/remote/attestation control SHA와 actual content digest 연결 |
| Git·Rollback | PASS | 구현 commit `3ac97a8`; exact 6파일 commit·원격 CI 성공 |
| 외부 Gate | WAIT | 2026-09-11 승인 변경창과 actual 12-Gate·역할·서명 증거 필요 |

## 검증 증거

- failure-first → attestation atomic read·Harness 검증기·remote content verifier 부재 5/5 EXPECTED FAIL
- remote content 집중 회귀 → 8/8 PASS
- 실제 P2 candidate commit content → 12 files·66,547 bytes·7 match·5 mismatch
- actual content digest → `ed2e0f50c9c51210c258f05d87019f7745210081f053d5ccc1bac2aa7c3999f5`
- mismatch attestation의 hash 변조·누락·`deploymentBasis=true` → fail-closed
- `production:cutover-preflight` → `READY_WAIT_CHANGE_WINDOW`, `localBlockers=0`, 보호 서비스 보존
- `npm.cmd run check` → 구문 396/396, 단위 770 total·763 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS
- GitHub-hosted quality run `33619409081`, commit `3ac97a8` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- P2 역사적 candidate manifest 불일치 5건은 원본을 보존한 채 acknowledged 상태이며 현재 Production 배포 근거가 아니다.
- 현재 P6의 실제 rollback candidate는 별도 SHA `e238ab8…`이며 이번 역사적 P2 attestation으로 대체하지 않는다.
- actual cutover gate PASS·DNS/TLS·P6→P7 승격은 `NOT_RUN`이다.
- 다음 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`다.
