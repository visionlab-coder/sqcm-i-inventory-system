# ACC-P6-29 Bounded Provider Preflight Runtime

기준일: 2026-09-02

## 결과 / 상태

- [x] Production backend container 조회 10초·1MiB 상한
- [x] 5종 provider probe 최대 150초·1MiB 상한
- [x] timeout·process·container·observation 오류 원문 미기록
- [x] provider 내부 오류 메시지 stderr 출력 제거
- [x] 실제 읽기 전용 probe에서 provider 5종 PASS
- [ ] 공개 전환 뒤 실제 외부 경로 provider 재검증

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 Gate 4 provider preflight의 container 조회가 무기한 정지하거나 provider stderr·비정상 JSON 원문을 노출할 수 있는 공백을 닫았지만 외부 provider 설정·계정·DB를 변경하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | Gate 4 provider read-only runtime 경계만 보완 |
| 산출물 | PASS | bounded runtime, runner 연계, failure-first 회귀 |
| 검증 | PASS | failure-first 5건, focused 8/8, 전체 531 PASS·1 SKIP |
| 보안 | PASS | 10초/150초·1MiB, stdout/stderr·provider raw error 미기록 |
| 추적성 | PASS | 큐·Harness·상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 3파일 구현 commit, GitHub quality 검증 |
| 외부 Gate | WAIT | 2026-09-11 공개 전환 뒤 exact HTTPS 경로 재검증 대기 |

## 검증 증거

- failure-first → bounded provider preflight runtime 부재 5/5 EXPECTED FAIL
- focused → runtime·기존 provider 평가 계약 8/8 PASS
- `npm.cmd run production:provider-preflight` → PostgreSQL storage·Defender bridge·AI health/readiness·loopback event publisher 5종 read-only PASS
- `npm.cmd run check` → 구문 327/327, 단위 531 PASS·Windows symlink 1 SKIP·0 FAIL
- `npm.cmd run repository:hygiene` → 고정 자격증명 0
- `npm.cmd run harness:verify` → 최초 ingress/public DNS 관측 2건 exit 1, 두 Gate 개별 PASS 뒤 전체 재실행 exit 0·지속 실패 미재현
- GitHub-hosted quality run `33565902058`, tested SHA `c06c868e2b6b3827c9615fa1dc95e44be95e4db4` → unit·three-tier-integration 모두 SUCCESS

## 미완료 / 외부 Gate

현재 probe는 AI PC loopback Production 내부 provider 상태를 검증했다. 공개 DNS/TLS 뒤 exact Production 경로의 실제 인증·업무 흐름과 최종 서명은 변경창 전까지 `NOT_RUN`이다.
