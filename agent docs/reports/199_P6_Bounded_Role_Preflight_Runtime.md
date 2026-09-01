# ACC-P6-28 Bounded Role Preflight Runtime

기준일: 2026-09-02

## 결과 / 상태

- [x] Production database container 조회 10초·1MiB 상한
- [x] role/MFA SQL 조회 10초·1MiB 상한
- [x] timeout·process·container·SQL 파싱 오류 원문 미기록
- [x] malformed·duplicate·unknown role 결과 fail-closed
- [x] 실제 읽기 전용 실행에서 계정·DB 변경 0건
- [ ] 실제 ADMIN·MANAGER·USER 생성·MFA·credential 연결

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 변경창 전 role preflight가 Docker·SQL 조회에 무기한 정지하거나 비정상 SQL 결과를 역할 0명으로 오인할 수 있는 공백을 닫았지만 실제 Production 계정·권한·credential을 만들거나 사용하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | role/MFA 준비상태 읽기 runtime 경계만 보완 |
| 산출물 | PASS | bounded runtime, runner 연계, failure-first 회귀 |
| 검증 | PASS | failure-first 5건, focused 9/9, 전체 526 PASS·1 SKIP |
| 보안 | PASS | 10초·1MiB, stdout/stderr·raw error 미기록, credential 파일 내용 미독해 |
| 추적성 | PASS | 큐·Harness·상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 3파일 구현 commit, GitHub quality 검증 |
| 외부 Gate | WAIT | 세 역할 actor·credential reference와 2026-09-11 변경창 대기 |

## 검증 증거

- failure-first → bounded role preflight runtime 부재 5/5 EXPECTED FAIL
- focused → runtime·기존 role 평가 계약 9/9 PASS
- `npm.cmd run production:role-preflight` → `READY_WAIT_ROLE_USERS_MFA_AND_CREDENTIAL_REFERENCES`, 세 역할 active·MFA 0명, credential reference 0/3, DB 쓰기 0건
- `npm.cmd run check` → 구문 325/325, 단위 526 PASS·Windows symlink 1 SKIP·0 FAIL
- `npm.cmd run repository:hygiene` → 고정 자격증명 0
- `npm.cmd run harness:verify` → 최초 exit 1 뒤 public/provider/log/role 읽기 Gate 개별 PASS, 진단 전체 재실행 exit 0·지속 실패 미재현
- GitHub-hosted quality run `33564789939`, tested SHA `5e7194db5c88b1528791fd95f4e312295089a674` → unit·three-tier-integration 모두 SUCCESS

## 미완료 / 외부 Gate

세 역할 actor와 credential reference가 없고 변경창 밖이므로 실제 로그인·MFA·RBAC core smoke는 실행하지 않았다. 승인된 변경창 안에서 UAT actor provisioning 뒤 동일 cutover run으로 재조회해야 한다.
