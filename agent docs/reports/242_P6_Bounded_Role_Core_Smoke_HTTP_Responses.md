# ACC-P6-50 Bounded Role Core Smoke HTTP Responses

기준일: 2026-09-02

## 결과 / 상태

- [x] 역할 MFA/RBAC smoke 응답의 직접 무제한 `response.json()` 제거
- [x] 응답마다 10초 timeout·declared/actual 1MiB 상한·fatal UTF-8·JSON object-only 적용
- [x] 과대 응답을 body read 전에 빈 객체로 fail-closed하고 인증 성공 승격 차단
- [x] role core smoke·role preflight·cutover preflight 실제 dry-run 재확인
- [x] 계정·자격증명·외부 변경 0건·`productionGo=false`
- [ ] 실제 ADMIN·MANAGER·USER 계정·MFA·RBAC smoke와 최종 서명

공식 Phase는 P6 `6/8`이다. 실제 역할 검증기가 사용할 HTTP 응답 경계만 강화했으며 계정·세션·Secret·DNS/TLS·컨테이너·DB는 변경하지 않았다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 G4 실제 역할 MFA/RBAC smoke JSON 응답의 bounded 검증 |
| 산출물 | PASS | 공용 bounded reader 연결과 failure-first·oversize 회귀 |
| 검증 | PASS | failure-first 1/1, focused 20/20, 전체 732 PASS·7 SKIP |
| 보안 | PASS | 10초·1MiB·fatal UTF-8·object-only·오류/credential 원문 비노출 |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | 구현 commit `0a67f08`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | 실제 역할 계정·MFA·로그인·서명은 승인 변경창 입력 필요 |

## 검증 증거

- failure-first → role smoke bounded reader 부재 1/1 EXPECTED FAIL
- role smoke·role result·공용 HTTP runtime 집중 회귀 → 20/20 PASS
- 과대 role response → body read 0회, 빈 객체 fail-closed
- `production:role-core-smoke` → `READY_WAIT_ROLE_CREDENTIAL_REFERENCES`, 실제 로그인 `NOT_RUN`
- `production:role-preflight` → 세 역할 active/MFA/credential reference 0건
- `production:cutover-preflight` → `READY_WAIT_CHANGE_WINDOW`, `localBlockers=0`
- `npm.cmd run check` → 구문 382/382, 단위 739 total·732 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS
- GitHub-hosted quality run `33605286537`, commit `0a67f08` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 승인 변경창: 2026-09-11 20:00~23:00 KST, rollback cutoff 22:00
- Production 역할 계정·MFA·credential reference·실제 HTTPS smoke·서명은 `NOT_RUN`
- 다음 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`다.
