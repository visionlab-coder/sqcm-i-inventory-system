# ACC-P6-25 Bounded Role Core Smoke HTTP

기준일: 2026-09-02

## 결과 / 상태

- [x] 역할별 모든 HTTP 요청 10초 상한
- [x] timeout·network 오류 bounded 상태 정규화
- [x] JSON 파싱 실패 시 provider 본문 미기록
- [x] MFA 뒤 중간 실패 시 활성 시험 세션 logout cleanup
- [x] cleanup 실패 원문 미노출
- [x] credential 미존재 dry-run에서 Secret read·실제 로그인 0건
- [ ] 실제 ADMIN·MANAGER·USER Production 로그인·MFA·RBAC

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 역할 core smoke가 네트워크 응답이나 실패 원문 때문에 무기한 정지·정보 노출되는 공백을 닫았지만 실제 계정 시험 또는 Production 증거를 만들지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | 역할 core smoke HTTP 경계와 실패 세션 cleanup만 보완 |
| 산출물 | PASS | bounded runtime, runner 연계, failure-first 회귀 |
| 검증 | PASS | failure-first 4건, focused 15/15, 전체 unit 509 PASS |
| 보안 | PASS | 10초 상한, credential·응답·cleanup 오류 원문 미기록 |
| 추적성 | PASS | 큐·Harness·상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 3파일 구현 commit, GitHub quality 2 jobs PASS |
| 외부 Gate | WAIT | 세 역할 credential 참조와 2026-09-11 변경창 대기 |

## 검증 증거

- failure-first → bounded runtime 부재 4/4 EXPECTED FAIL
- focused → runtime·cleanup·core smoke·target selection 15/15 PASS
- `npm.cmd run production:role-core-smoke` → `READY_WAIT_ROLE_CREDENTIAL_REFERENCES`, 세 역할 참조 false, 실제 로그인 `NOT_RUN`
- `npm.cmd run check` → 구문 319/319, 단위 509 PASS·Windows symlink 1 SKIP·0 FAIL
- `npm.cmd run repository:hygiene` → 고정 자격증명 0
- `npm.cmd run harness:verify` → P6 등록 검증 전체 exit 0, 최종 status PASS
- GitHub-hosted quality run `33561511801`, tested SHA `8ce0b980ab560f4fb16606deb32b8b57961f7190` → unit·three-tier-integration 모두 SUCCESS

## 미완료 / 외부 Gate

Production ADMIN·MANAGER·USER credential 참조가 없으므로 실제 로그인·MFA·RBAC와 logout 확인은 수행하지 않았다. 승인된 변경창 안에서 UAT actor provision과 ingress publication 뒤 동일 cutover run으로 실행해야 한다.
