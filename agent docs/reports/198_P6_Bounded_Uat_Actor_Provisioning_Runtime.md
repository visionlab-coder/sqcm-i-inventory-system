# ACC-P6-27 Bounded UAT Actor Provisioning Runtime

기준일: 2026-09-02

## 결과 / 상태

- [x] Docker 제어 호출별 10초 상한
- [x] UAT actor worker 60초·1MiB 상한
- [x] timeout·process·worker JSON·cleanup 오류 원문 미기록
- [x] worker 임시 파일 제거 성공 뒤에만 provisioning 성공 보고
- [x] credential 미존재 dry-run에서 process·계정·DB 변경 0건
- [ ] 실제 ADMIN·MANAGER·USER Production 시험계정 생성

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 변경창에서 사용하는 UAT actor provisioning runner가 Docker·worker 호출에 무기한 정지하거나 credential·stdout·stderr·오류 원문을 노출하고 임시 worker를 남긴 채 성공을 보고할 수 있는 공백을 닫았지만 실제 Production 계정을 만들지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | UAT actor provisioning의 process 경계·redaction·cleanup만 보완 |
| 산출물 | PASS | bounded runtime, runner 연계, failure-first 회귀 |
| 검증 | PASS | failure-first 5건, focused 12/12, 전체 521 PASS·1 SKIP |
| 보안 | PASS | 제어 10초, worker 60초·1MiB, credential·stdout/stderr·raw error 미기록 |
| 추적성 | PASS | 큐·Harness·상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 3파일 구현 commit, GitHub quality 2 jobs PASS |
| 외부 Gate | WAIT | actor 승인 reference·역할별 credential과 2026-09-11 변경창 대기 |

## 검증 증거

- failure-first → bounded UAT actor runtime 부재 5/5 EXPECTED FAIL
- focused → runtime·기존 provisioning 계약 12/12 PASS
- `npm.cmd run production:uat-actor-provision` → `READY_WAIT_UAT_ACTOR_PROVISION_INPUTS`, process·계정·DB mutation 0건, actual `NOT_RUN`
- `npm.cmd run check` → 구문 323/323, 단위 521 PASS·Windows symlink 1 SKIP·0 FAIL
- `npm.cmd run repository:hygiene` → 고정 자격증명 0
- `npm.cmd run production:public-probe` → DNS observation PASS, `READY_WAIT_DNS_TLS_PUBLICATION`
- `npm.cmd run harness:verify` → P6 등록 검증 전체 exit 0, 최종 status PASS
- GitHub-hosted quality run `33563579239`, tested SHA `93babf8e3b6ab9f2393e2cdf74134220bcdaec96` → unit·three-tier-integration 모두 SUCCESS

## 미완료 / 외부 Gate

승인 reference와 ADMIN·MANAGER·USER credential reference가 없으므로 실제 Production 시험계정 생성과 역할 연결은 실행하지 않았다. 승인된 변경창 안에서 ingress publication 및 동일 cutover run의 실제 역할별 인증 검증 전에 실행해야 한다.
