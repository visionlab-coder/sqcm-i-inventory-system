# ACC-P6-30 Bounded CSRF Idempotency Baseline Runtime

기준일: 2026-09-02

## 결과 / 상태

- [x] negative login HTTP 10초 상한
- [x] database container·SQL 10초·1MiB 상한
- [x] timeout·network·process·DB 오류 원문 미기록
- [x] session count·5열 schema 엄격 파싱
- [x] 실제 403 CSRF 역조건과 schema baseline PASS
- [ ] 실제 ADMIN 인증 쓰기·replay·conflict 검증

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 Gate 7 baseline의 Docker·SQL 조회가 무기한 정지하거나 malformed DB 결과를 정상 업무 실패로 오인할 수 있는 공백을 닫았지만 실제 인증 사용자 쓰기나 외부 변경을 수행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | negative CSRF·schema baseline runtime 경계만 보완 |
| 산출물 | PASS | bounded runtime, runner 연계, failure-first 회귀 |
| 검증 | PASS | failure-first 6건, focused 6/6, 전체 537 PASS·1 SKIP |
| 보안 | PASS | HTTP/process 10초·1MiB, response·stdout/stderr raw 미기록 |
| 추적성 | PASS | 큐·Harness·상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 3파일 구현 commit, GitHub quality 검증 |
| 외부 Gate | WAIT | ADMIN credential·쓰기 확인과 2026-09-11 변경창 대기 |

## 검증 증거

- failure-first → bounded CSRF baseline runtime 부재 6/6 EXPECTED FAIL
- focused → HTTP/process·container/count/schema 계약 6/6 PASS
- `npm.cmd run production:csrf-idempotency-baseline` → 403 `CSRF_INVALID`, session count unchanged, schema 10/10, unique index 1, stuck/invalid 0
- `npm.cmd run check` → 구문 329/329, 단위 537 PASS·Windows symlink 1 SKIP·0 FAIL
- `npm.cmd run repository:hygiene` → 고정 자격증명 0
- GitHub-hosted quality run `33567060485`, tested SHA `9679c3050036591f838409872cfd9e821252604c` → unit·three-tier-integration 모두 SUCCESS
- 전체 Harness는 반복된 종속 Gate `production-ingress-publication` 실패를 `ACC-P6-31` 대체 DNS 관측으로 보완한 뒤 최종 exit 0

## 미완료 / 외부 Gate

실제 ADMIN credential과 쓰기 확인이 없으므로 인증 사용자 CSRF 정상 쓰기, idempotency replay·payload conflict와 실제 DB 감사 검증은 실행하지 않았다. 승인된 변경창 안에서 `production:authenticated-idempotency -- --public`로 실행해야 한다.
