# 서원토건 비품관리 시스템 최신 단일 현황

<!-- HARNESS_STATUS_START -->
Harness 진행: **6 / 8 Phase 완료**
현재 Phase: **P6**
현재 READY: `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`
Production GO: **false**
<!-- HARNESS_STATUS_END -->

기준일: 2026-09-01

릴리스 기준 브랜치: `main`
현재 작업 브랜치: `codex/p6-ai-pc-postgres-production` (배포 후보 `e238ab8dab7f4729298ceb7ecc0f874a4a08829a`)
최신 릴리스 기준 main: `79a12924106b378d2337898c76a4dd431634b78d`

상태: **P5 staging UAT 19/19·서명 3/3 완료 / P6-G3 AI PC loopback Production 배포·복구 PASS / P6-G4 공개 전환 대기 / Production NO-GO**

이 문서는 현재 상태의 단일 정본이다. 과거 Phase 보고서의 당시 수치와 설계 결정은 역사 증거로 보존하되 현재 판정에는 이 문서와 실제 코드·테스트 결과를 우선한다.

## 2026-09-01 P6-G4 공개 전환 사전점검

- P6·P7 연속 진행 가속 계약을 추가했다. 외부 변경창 대기는 실패로 세지 않고, 실제 실행 실패 2회에는 동일 수용조건의 대체 경로를 적용하며 3회에만 중단한다.
- 기계 큐 `P6_P7_ACCELERATION_QUEUE.json`은 P6의 실행 공백과 P7 준비를 순차 관리한다. P7 인수 preflight는 P6 대기 중 준비할 수 있지만 P7 상태는 P6 완료 전 미착수로 유지한다.
- `ACC-P6-01`을 완료했다. `production:role-core-smoke`는 credential reference가 없으면 `READY_WAIT_ROLE_CREDENTIAL_REFERENCES`로 안전 대기하고, 입력이 있을 때 세 역할의 MFA challenge·오류 코드 401·유효 TOTP·역할 identity·dashboard/cost/admin 200/403·익명 401·logout을 실행한다. 기본 loopback 성공은 Production PASS로 승격하지 않는다. `--public`은 승인 변경창과 exact 확인 문자열이 모두 있을 때만 `https://inventory.safe-link.co.kr`을 사용한다. 실제 시험은 참조 0/3으로 `NOT_RUN`이다.
- `ACC-P6-02`를 완료했다. `production:authenticated-idempotency`는 ADMIN MFA 세션으로 missing-CSRF 403, 최초 쓰기 201, 동일 key replay, 다른 payload 409, DB 단일 행·감사, 테스트 자산·감사·key 정리 0건과 logout을 검증한다. 기본 loopback 성공은 실제 Production PASS로 승격하지 않는다. `--public`은 승인 변경창에서 exact Production HTTPS만 사용하며 현재 credential reference와 쓰기 확인이 없어 실제 쓰기는 `NOT_RUN`이다.
- `ACC-P6-03`을 완료했다. `production:cutover-orchestrator`가 12개 Gate 순서, 20:00~23:00 변경창, 22:00 cutoff, 필수 Gate 실패 시 `production:route-disable -- --execute`로 전환하고 loopback·volume을 보존하는 계약을 dry-run으로 검증했다. 공개 역할·비기능·운영 health Gate는 모두 exact `--public` 명령을 사용한다. 외부 변경은 0건이다.
- `ACC-P6-04`를 완료했고 finalizer의 fail-open 공백도 보완했다. `production:cutover-finalizer`는 실제 cutover 증거 파일이 없으면 `READY_WAIT_ACTUAL_CUTOVER_EVIDENCE`로 안전 대기한다. 실제 파일이 있더라도 정확히 12개 고유 Gate·세 역할 UAT·업무/보안/운영 승인·불변 SHA·정확한 Production URL·`productionGo=true`가 모두 없으면 실패하며 template·staging·loopback·baseline과 불완전 증거 승격을 거부한다. 회귀 5/5가 통과했다.
- `ACC-P6-05`를 완료했다. `production:ingress-publication`은 exact Production tunnel·runtime config·connector·proxied CNAME만 만들며 승인 변경창, publication 확인, route-disable 확인과 최소 권한 rollback token file reference가 모두 없으면 게시하지 않는다. 현재 token reference가 없어 `READY_WAIT_INGRESS_PUBLICATION_INPUTS`이고 tunnel·config·DNS·프로세스 mutation은 0건이다. 통합 사전검토는 `ALLOW_WITH_CONDITIONS`, 회귀는 7/7 PASS다.
- `ACC-P6-06`을 완료했다. `production:uat-actor-provision`은 저장소 밖 승인 파일과 ADMIN·MANAGER·USER credential reference가 정확히 일치할 때만 변경창에서 세 역할을 단일 transaction으로 생성·갱신한다. 기존 비시험 identity 충돌은 거부하고 bcrypt cost 12, 암호화 TOTP, 역할 scope, 기존 session 폐기와 actor별 audit를 함께 검증한다. 현재 참조 0/4로 `READY_WAIT_UAT_ACTOR_PROVISION_INPUTS`이며 실제 계정·MFA·DB mutation은 0건이다.
- `ACC-P6-07`을 완료했다. 기계 정본의 과거 branch `codex/fix-sidebar-accessibility`를 실제 `codex/p6-ai-pc-postgres-production`으로 교정하고, `harness:check`가 local symbolic ref와 GitHub Actions head/ref provenance를 대조하도록 보완했다. active branch 해석 불가·누락·불일치는 fail-closed하며 회귀 4/4가 통과했다.
- `ACC-P6-08`을 완료했다. `production:cutover-failure-matrix`는 artifact부터 UAT signoff까지 12개 Gate 각각을 단일 실패 지점으로 주입해 실패 Gate까지만 실행되고 이후 Gate가 모두 중단되는지 검증한다. 12/12 시나리오가 exact public route-disable 확인으로 격리됐고, route-disable 미확인·Gate 결과 개수/순서/값 변조는 차단되며 합성 all-pass도 Production GO로 승격되지 않는다. focused 5/5, 저장소 구문 223개와 단위 321/321이 PASS했고 실제 cutover·route 변경은 0건이다.
- `ACC-P6-09`를 완료했다. `production:cutover-execution-rehearsal`은 변경창·외부 확인·정확한 12 handler 계약을 선검사하고 Gate를 순차 실행한다. cutoff 또는 첫 실패·예외 뒤에는 이후 Gate를 모두 중단하고 exact route-disable 상태와 evidence reference가 함께 확인되기 전에는 containment를 금지한다. 12 Gate 합성 PASS 뒤에도 finalizer 전 `productionGo=false`이며 focused 6/6, 저장소 구문 225개와 단위 327/327이 PASS했다. 실제 외부 handler·cutover·route 변경은 0건이다.
- `ACC-P6-10`을 완료했다. `production:cutover-adapter-rehearsal`은 12개 Gate를 기존 Production runner 14개 step에 exact public/execute 인자와 허용 상태 allowlist로 연결한다. exit 0이어도 `READY_WAIT_*`인 결과, step·Gate evidence reference 누락, route-disable 대기와 plan 순서 변조는 실패로 처리한다. focused 6/6, 저장소 구문 228개와 단위 333/333이 PASS했고 실제 process·외부 mutation은 0건이다.
- `ACC-P6-11`을 완료했다. `production:cutover-process-runner-rehearsal`은 구조화된 14개 step 결과에서 최상위 JSON 상태를 정규화하고 12개 Gate와 함께 저장소 밖 receipt 26건으로 기록하는 계약을 합성 검증한다. receipt는 stdout·stderr·Secret을 제외하고 물리 디렉터리·경로 경계·원자적 1회 쓰기를 강제한다. focused 2 PASS·Windows symlink 1 SKIP, 저장소 단위 335 PASS·동일 1 SKIP, Harness가 PASS했으며 실제 process·공개 변경·runtime receipt 생성은 0건이다.
- `ACC-P6-12`를 완료했다. `production:cutover-execute`는 상태 머신·14-step adapter·process runner를 한 진입점으로 연결하되 변경창·exact 확인·물리 receipt root를 먼저 검사한다. dry-run·변경창 밖·미확인·root 실패에서는 handler·child process·파일 준비가 모두 0건이고, 합성 confirmed 경로는 12 Gate·14 step·26 receipt를 연결했다. focused 7 PASS·Windows symlink 1 SKIP, 저장소 단위 340 PASS·동일 1 SKIP, Harness가 PASS했으며 실제 cutover·runtime receipt·외부 변경은 `NOT_RUN`이다.
- `ACC-P6-13`을 완료했다. 모든 step·Gate receipt가 동일 `runId`와 변경창 시각을 공유하고 Gate summary가 exact step 파일명을 참조하도록 provenance를 강화했다. `production:cutover-actual-evidence`는 12 Gate·14 step·세 역할 actual 결과·업무/보안/운영 identity 서명의 SHA를 검증해 P6 finalizer와 P7 인수에 호환되는 `P6_CUTOVER_ACTUAL` 문서를 저장소 밖에 원자적으로 1회 조립한다. focused 5/5, 저장소 단위 345 PASS·Windows symlink 1 SKIP이며 현재 actual 입력이 없어 assembly·출력·외부 변경은 `NOT_RUN`이다.
- `ACC-P6-14`를 완료했다. process runner는 실제 `role-core-smoke` PASS 출력에서 비밀번호·TOTP·cookie·session·CSRF를 제외한 상태 allowlist만 receipt summary로 보존한다. `production:role-result-evidence`는 동일 runId·release SHA의 step/Gate receipt 연결과 실제 Production HTTPS MFA·RBAC matrix를 검증해 ADMIN·MANAGER·USER actual 결과 3건을 저장소 밖에 원자적으로 함께 작성한다. focused 5/5, 저장소 구문 240개와 단위 350 PASS·Windows symlink 1 SKIP, Harness verify가 PASS했으며 현재 실제 runId·출력 참조가 없어 결과 생성·외부 변경은 `NOT_RUN`이다.
- `ACC-P6-15`의 중단·재개 계약을 완료했다. Gate 1~11의 exact PASS receipt와 동일 runId·release SHA·변경창만 checkpoint로 인정하고 역할 actual 결과 3건·identity 서명 3건·exact 확인 뒤에만 Gate 12 재개를 연다. 교차 run/SHA, 경로 evidence, 변조와 22:00 cutoff 이후 재개는 `routeDisableRequired=true`로 차단한다. focused 5/5, 저장소 구문 243개와 단위 355 PASS·Windows symlink 1 SKIP, Harness verify가 PASS했으며 실제 executor pause/resume·route 변경은 `NOT_RUN`이다.
- `ACC-P6-16`을 완료했다. 실제 cutover 실행기에 `--pause-before-signoff`와 `--resume-signoff`를 연결해 Gate 1~11 뒤 저장소 밖 물리 checkpoint를 원자 기록하고 동일 run·release SHA의 11 Gate·13 step receipt와 SHA, 역할 결과·identity 서명 6건을 검증한 뒤 Gate 12만 sequence 25부터 재개한다. 변조·cutoff·Gate 12 실패는 exact route-disable adapter와 evidence 없이는 격리하지 않는다. 물리 임시 종단 리허설은 동일 run 11+1 Gate·14 step·26 receipt·checkpoint 1건으로 PASS했고 focused 9/9, 저장소 구문 246개와 단위 364 PASS·Windows symlink 1 SKIP이다. 실제 Production 실행·route 변경은 `NOT_RUN`이다.
- `ACC-P6-17`을 완료했다. Gate 12 뒤 동일 run의 26 receipt·세 역할 결과·세 identity 서명을 actual assembler/finalizer에 즉시 연결하고 저장소 밖 원자 기록까지 성공한 경우에만 GO를 반환한다. 조립·검증·쓰기 실패는 exact route-disable receipt 없이는 격리 완료로 인정하지 않는다. focused 10/10과 dry-run이 PASS했으며 실제 Production finalization·route 변경은 `NOT_RUN`이다.
- `ACC-P6-18`을 완료했다. 실제 `--resume-signoff --execute`는 Gate 12와 actual finalizer를 항상 원자 흐름으로 묶고 signoff resume·evidence assembly의 두 exact 확인과 저장소 밖 출력 경로를 Gate 12 전에 검사한다. 누락 시 Gate 12·child process는 0건이며, 사후 조립·검증·쓰기 실패는 exact route-disable로 containment한다. focused 11/11과 dry-run이 PASS했고 실제 외부 변경은 `NOT_RUN`이다.
- `ACC-P6-19`를 완료했다. `production:phase-promotion`은 저장소 밖 actual P6 evidence·SHA·exact 확인·깨끗한 worktree를 검증한 뒤에만 P6 완료·P7 진행·7/8·Production GO, 가속 큐와 사람용 상태 블록을 같은 실행에서 갱신한다. P7 G0 Harness verifier도 등록했다. 현재 actual evidence가 없어 dry-run 대기이며 실제 상태 전환은 `NOT_RUN`이다.
- `ACC-P7-01`을 완료했다. `operations:handover-preflight`는 SLO·경보·백업·복원·인증서·온콜·정기점검·개선 큐 8개 영역을 fail-closed 검사한다. 계약 오류 0, focused 4/4, 저장소 구문 171개와 단위 200/200이 PASS했다. 실제 증거 참조 12개와 P6 완료가 없어 `READY_WAIT_P6_COMPLETION_AND_HANDOVER_INPUTS`이며 P7은 미착수다.
- `ACC-P7-02`의 실제 증거 finalizer 준비를 완료했다. `operations:handover-finalizer`는 P6 actual cutover, 운영 8영역 PASS, Production provenance와 운영 책임자 identity 서명을 모두 요구하고 template·staging·loopback·baseline 증거를 거부한다. 현재는 `READY_WAIT_P6_COMPLETION_AND_HANDOVER_EVIDENCE`이며 실제 활성화는 `NOT_RUN`이다.
- `ACC-P7-03`을 완료해 finalizer의 문자열 참조 fail-open을 제거했다. 이제 P6 cutover·운영 8영역·운영 서명 총 10개 실제 JSON은 path와 SHA-256이 일치해야 하며 SLO·경보 5종 receipt·off-site backup·격리 restore·TLS·온콜·maintenance·개선 큐 측정값까지 통과해야 한다. 문자열-only·누락·해시 변조·staging 증거는 차단되며 focused 5/5, 저장소 250/250이 PASS했다.
- `ACC-P7-04`를 완료했다. `operations:handover-assembler`는 P6 완료·P7 진행 중·실제 10문서·저장소 밖 output·정확한 확인 문자열이 모두 있을 때만 SHA manifest를 조립한다. 조립 전 동일 finalizer로 10/10을 검증하고 원자적 1회 쓰기로 기존 파일을 덮어쓰지 않는다. 현재 입력 0/10·output 없음으로 `READY_WAIT_P6_COMPLETION_AND_HANDOVER_FILES`, manifest 생성은 `NOT_RUN`이다.
- `ACC-P7-05`를 완료했다. `operations:slo-evidence`는 exact Production URL의 외부 30일 측정 원본과 SHA-256을 검증하고 30개 이상 UTC 날짜의 샘플에서 가용성·p95를 직접 계산한다. 가용성 99.5% 미만, p95 1000ms 초과, staging·짧은 기간·중복/무효 샘플은 차단하며 저장소 밖에 원자적으로 1회만 쓴다. 현재 P6 미완료·P7 미착수·측정 원본 없음으로 `READY_WAIT_P6_COMPLETION_AND_SLO_INPUT`, 실제 SLO 증거 생성은 `NOT_RUN`이다.
- `ACC-P7-06`을 완료했다. `operations:alerting-evidence`는 Production 공급자 export에서 availability·latency p95·HTTP 5xx·backup failure·certificate expiry 5종의 고유 receipt와 발생/수신 시각, 공급자·채널·수신자·책임자·원본 SHA를 검증한다. template·staging·loopback·순서 변경·미수신·중복 receipt를 차단하고 저장소 밖에 원자적으로 1회만 쓴다. 현재 실제 receipt 0/5로 `READY_WAIT_P6_COMPLETION_AND_ALERT_RECEIPTS`, 실제 경보 증거 생성은 `NOT_RUN`이다.
- `ACC-P7-21`을 완료했다. `operations:alert-delivery-runner`는 P6 actual 완료·P7 활성화·Production GO, 승인된 공급자 manifest·물리 credential·저장소 밖 신규 output·exact 확인 전에는 경보 메시지·secret read·write를 모두 0건으로 유지한다. 실행 시 공개 HTTPS 공급자에 5종 시험 경보를 고정 run/signal idempotency key로 순차 전송하고 provider·channel·recipient provenance가 일치하는 고유 `DELIVERED` receipt와 5분 이하 전달 시각만 compiler 호환 actual export로 원자 기록한다. 현재 `READY_WAIT_P6_ACTUAL_CUTOVER`이며 실제 경보 발송·Secret 사용·export 생성은 `NOT_RUN`이다.
- `ACC-P7-22`를 완료했다. `operations:oncall-drill-runner`는 P6 actual 완료·P7 활성화·Production GO, 승인된 Asia/Seoul 30일 연속 당번표·서로 다른 수락 책임자·공개 HTTPS 공급자·물리 credential·저장소 밖 신규 output·exact 확인 전에는 메시지·secret read·write를 모두 0건으로 유지한다. 실행 시 PRIMARY→ESCALATION 시험을 역할별 deterministic idempotency key로 순차 전송하고 provider·channel·owner provenance가 일치하는 고유 `ACKNOWLEDGED` receipt와 5분·15분 이내 시각만 compiler 호환 actual export로 원자 기록한다. 현재 `READY_WAIT_P6_ACTUAL_CUTOVER`이며 실제 책임자 지정·수락·메시지 발송·Secret 사용·export 생성은 `NOT_RUN`이다.
- `ACC-P7-07`을 완료했다. `operations:backup-restore-evidence`는 동일한 actual Production drill export에서 24시간 RPO·30일 retention·off-site storage·artifact checksum이 확인된 backup과 동일 backup ID를 사용한 4시간 RTO·격리 target·row-count digest·migration 일치 restore를 검증한다. template·staging·loopback·오래된 backup·부분 검증·source DB 복원·불일치 count를 차단하며 저장소 밖 backup·restore 문서 2건을 원자적으로 함께 쓴다. 현재 실제 drill 0건으로 `READY_WAIT_P6_COMPLETION_AND_BACKUP_RESTORE_DRILL`, 실제 증거 생성은 `NOT_RUN`이다.
- `ACC-P7-19`를 완료했다. `operations:backup-restore-runner`는 P6 actual 완료·P7 활성화·Production GO와 exact 확인, 저장소 밖 신규 output, 승인된 off-site attestation과 프로젝트 드라이브와 다른 물리 root가 모두 있을 때만 실행된다. backend의 repeatable-read exported snapshot을 유지해 exact Production DB counts와 `pg_dump -Fc`를 같은 snapshot에 묶고, 암호화-at-rest·별도 failure-domain root에 직접 저장한 SHA-256 backup을 임시 격리 DB에 복원한다. 33 tables·25 migrations·전체 counts digest 일치와 4시간 RTO를 검증하고 임시 DB를 제거한다. 현재 `READY_WAIT_P6_ACTUAL_CUTOVER`이며 Production read·off-site write·DB mutation은 0건이다.
- `ACC-P7-08`을 완료했다. `operations:certificate-evidence`는 exact Production HTTPS의 최근 60분 TLS 관측에서 hostname·chain·TLSv1.2/1.3·serial·SHA-256 fingerprint·유효기간·health/readiness 200과 갱신 공급자·책임자를 검증하고 30일 이상 잔여 인증서만 actual 문서로 컴파일한다. template·staging·loopback·다른 hostname·오래된 관측·미개시/만료/갱신 임박 인증서를 차단한다. 현재 DNS/TLS 미게시·실제 관측 0건으로 `READY_WAIT_P6_COMPLETION_AND_CERTIFICATE_OBSERVATION`, 실제 증거 생성은 `NOT_RUN`이다.
- `ACC-P7-17`을 완료했다. `operations:certificate-observer`는 P6 actual 완료·P7 활성화·Production GO와 exact 확인·저장소 밖 신규 물리 출력·갱신 책임자·공급자 참조가 모두 있을 때만 `inventory.safe-link.co.kr`의 TLS와 `/health`·`/api/readiness`를 읽는다. 시스템 trust store로 chain/hostname을 검증하고 TLSv1.2/1.3·serial·SHA-256 fingerprint·유효기간·200/200을 compiler 입력 JSON으로 원자적 1회 기록한다. 현재는 `READY_WAIT_P6_ACTUAL_CUTOVER`이며 HTTP read/write·외부 변경은 모두 0건이다.
- `ACC-P7-09`를 완료했다. `operations:oncall-evidence`는 Asia/Seoul 기준 30일 이상 연속 당번표, 서로 다른 primary·escalation 책임자의 유효한 수락, 최근 7일 escalation drill의 5분·15분 이내 고유 receipt와 역할 일치를 검증한다. template·staging·loopback·동일 책임자·미수락/짧은 당번표·느리거나 오래된 drill을 차단하고 저장소 밖에 원자적으로 1회만 쓴다. focused 7/7, 저장소 구문 209개와 단위 291/291이 PASS했으며 실제 담당자 지정·메시지·drill·증거 생성은 `NOT_RUN`이다.
- `ACC-P7-10`을 완료했다. `operations:maintenance-evidence`는 `docs/maintenance.md`와 exact Production URL·불변 release SHA·운영자 identity를 고정하고 최근 24시간 일일 점검의 frontend/API/DB health·5xx·로그인 실패 급증·백업 6종 PASS와 고유 receipt, 실행창 안 관측, 차단 finding 0건, 24시간 안의 다음 점검을 검증한다. template·staging·loopback·가변 이미지·누락/순서 변경·FAIL·중복 receipt·오래된 실행을 차단한다. focused 7/7, 저장소 구문 212개와 단위 298/298이 PASS했으며 실제 점검·증거 생성은 `NOT_RUN`이다.
- `ACC-P7-18`을 완료했다. `operations:maintenance-runner`는 P6 actual 완료·P7 활성화·Production GO와 exact 확인, 실제 운영자·일정·다음 실행 시각, 저장소 밖 신규 물리 출력이 모두 있을 때만 exact Production HTTPS, PostgreSQL SELECT, backend 15분 로그와 최신 backup을 읽는다. 배포된 frontend/backend 불변 SHA 일치, frontend/API/readiness 200, DB `seowon_inventory`, 5xx 0, 최근 로그인 실패가 이전 24시간 기반 적응 임계치 이하, backup checksum과 24시간 age를 검증해 6종 고유 receipt export를 원자적으로 한 번 기록한다. 현재 `READY_WAIT_P6_ACTUAL_CUTOVER`이며 HTTP/runtime read/write·외부 변경은 0건이다.
- `ACC-P7-11`을 완료했다. `operations:improvement-queue-evidence`는 전용 `visionlab-coder/sqcm-i-inventory-system` operations Issue queue를 고정하고 최근 24시간 export·7일 triage·다음 triage·책임자·고유 receipt·미추적 finding 0건을 검증한다. 각 open item은 고유 Issue, incident/security/performance/dependency/migration/backup/user_feedback source, P1~P4, 담당자 identity, acceptance reference, 30일 후속기한과 BLOCKED 의존 Issue를 가져야 한다. template·staging·loopback·다른 공급자/저장소·count 불일치·중복 Issue·미분류 항목을 차단한다. focused 7/7, 저장소 구문 215개와 단위 305/305가 PASS했으며 실제 Issue 생성·수정·증거 생성은 `NOT_RUN`이다.
- `ACC-P7-20`을 완료했다. `operations:improvement-queue-collector`는 P6 actual 완료·P7 활성화·Production GO, 저장소 밖 물리 token·triage attestation·신규 output과 exact 확인 전에는 GitHub read·secret read·write를 모두 0건으로 유지한다. 실행 시 전용 operations Issue만 읽으며 일반 본문은 신뢰하지 않고 `operations`와 source/severity/status 고정 label, 단일 bounded JSON metadata의 일치만 파싱한다. 담당자·수용조건·triage·다음 행동·BLOCKED 의존성을 compiler로 선검증하고 저장소 밖 actual export를 원자적으로 1회만 쓴다. 현재 `READY_WAIT_P6_ACTUAL_CUTOVER`이며 실제 GitHub read·Issue 변경·export 생성은 `NOT_RUN`이다.
- `ACC-P7-12`를 완료했다. `operations:signoff-evidence`는 exact Production URL·불변 release SHA·P6 cutover 증거 SHA와 순서가 고정된 운영 8영역의 PASS·고유 SHA를 요구한다. 운영 책임자 identity의 최근 24시간 APPROVED receipt, 차단 예외 0건과 on-call·경보 대응·백업/복원·인증서 갱신·일일 점검·개선 triage 6개 업무 수락을 모두 검증하고 finalizer 호환 문서를 저장소 밖에 원자적으로 1회만 쓴다. focused 7/7, 저장소 구문 218개와 단위 312/312가 PASS했으며 실제 서명·책임자 지정·외부 변경·증거 생성은 `NOT_RUN`이다.
- `ACC-P7-23`을 완료했다. `operations:signoff-input-assembler`는 P6 actual 완료·P7 활성화·Production GO, 저장소 밖 물리 P6 cutover·운영 8영역·OPERATIONS_OWNER 승인 receipt·신규 output·exact 확인 전에는 input read/write를 0건으로 유지한다. 실행 시 P6 GO·불변 release, 운영 8영역 actual PASS·고유 SHA, maintenance release 일치, 최근 24시간 owner receipt·6개 운영 업무 수락·차단 예외 0건을 교차검증해 compiler 호환 signoff input을 원자 기록한다. 현재 `READY_WAIT_P6_ACTUAL_CUTOVER`이며 실제 책임자 지정·서명·입력 읽기·export 생성은 `NOT_RUN`이다.
- `ACC-P7-24`를 완료했다. `operations:activation-orchestrator`는 P6 actual 완료·P7 활성화·Production GO와 저장소 밖 물리 P6 증거·exact 19단계/10행위 승인·receipt root·확인값 전에는 child·approval read·receipt write를 0건으로 유지한다. 실행 시 한 호출에 다음 한 단계만 수행하고 원문 없는 SHA receipt로 재개하며 sequence·command·digest·runId 변조를 거부한다. `WAIT`는 실패가 아니고 동일 단계 `FAIL` 3회만 `PAUSED`한다. 현재 `READY_WAIT_P6_ACTUAL_CUTOVER`이며 실제 운영 호출·외부 변경·서명·증거 생성은 `NOT_RUN`이다.
- `ACC-P7-25`를 완료했다. 상시 Heartbeat 중첩 시 두 프로세스가 같은 P7 외부 단계를 동시에 선택하던 공백을 동일 run single-writer lease로 닫았다. 첫 프로세스만 다음 단계를 수행하고 두 번째는 안전 대기하며, owner-only 정상 해제와 crash stale lock 자동 삭제 금지를 강제한다. 30일 SLO 장기 WAIT는 4자리 attempt 영수증으로 9999회까지 정렬·재개된다. focused 11/11 PASS이며 현재 P6 미완료 상태에서는 lease·child·receipt write 모두 0건이다.
- `ACC-P7-26`을 완료했다. 서로 다른 승인 run이 같은 receipt root에서 별도 lease를 획득해 동일 영수증 파일을 교체할 수 있던 교차-run 공백과 `exists → rename` TOCTOU 덮어쓰기 공백을 닫았다. 최초 run ID SHA-256 claim을 폴더에 영속 기록해 다른 run 재사용을 차단하고, 최종 영수증은 hard-link no-replace로 게시해 경쟁이 생겨도 기존 증거를 보존한다. 구현 전 2건 예상 실패, 구현 후 focused 13/13과 전체 단위 442 PASS·1 SKIP·0 FAIL, Harness PASS다. 현재 P6 미완료 상태에서는 root claim·lease·child·receipt write 모두 0건이다.
- `ACC-P7-27`을 완료했다. 동일 run ID에 새 승인 manifest나 다른 release SHA를 결합하면 과거 receipt를 재사용할 수 있던 provenance 공백을 닫았다. JSON key 순서에 독립적인 canonical approval SHA-256과 exact release SHA를 schema 2 root claim·lease·모든 receipt에 결합하고, 현재 승인과 다른 root 또는 receipt는 child 실행 전에 거부한다. 구현 전 2건 예상 실패, 구현 후 focused 16/16과 전체 단위 445 PASS·1 SKIP·0 FAIL, Harness PASS다. 현재 P6 미완료 상태에서는 approval read·root claim·lease·child·receipt write 모두 0건이다.
- `ACC-P7-28`을 완료했다. 운영 활성화 오케스트레이터가 19개 child에 상위 `process.env` 전체를 넘기던 Secret 전파 공백을 닫았다. 각 단계는 필요한 환경변수 이름을 계약으로 명시하고 child는 안전한 runtime 변수와 현재 단계 allowlist만 받는다. unrelated Secret·GitHub token·`NODE_OPTIONS`는 전달하지 않는다. 구현 전 2건 예상 실패, 구현 후 focused 18/18과 전체 단위 447 PASS·1 SKIP·0 FAIL, Harness PASS다. 현재 P6 미완료 상태에서는 child·write 모두 0건이다.
- `ACC-P7-29`를 완료했다. 승인 후 오케스트레이터, 19개 child script 또는 그 로컬 정적 의존성이 변경돼도 기존 승인 manifest를 재사용할 수 있던 실행 provenance 공백을 닫았다. 승인 문서는 source·entrypoint·child root와 재귀 dependency graph의 exact 물리 경로·bytes로 계산한 activation bundle SHA-256을 포함하고, 현재 digest 불일치는 lease·child·receipt 전에 거부한다. 구현 전 2건 예상 실패, 구현 후 focused 20/20과 전체 단위 449 PASS·1 SKIP·0 FAIL, Harness PASS다. 현재 P6 미완료 상태에서는 번들 검증·approval read·lease·child·write 모두 0건이다.
- `ACC-P7-30`을 완료했다. activation manifest의 `authorizedByRef` 문자열만으로 운영 승인을 자기선언할 수 있던 공백을 닫았다. 별도 저장소 밖 OPERATIONS_OWNER MFA approval receipt의 물리 SHA-256과 P6 actual cutover SHA-256·P6 OPERATIONS 실제 서명 SHA를 manifest에 결합하고 signer·signedAt·run·release·bundle·19단계·10행위가 모두 같아야 한다. 구현 전 2건 예상 실패, 구현 후 focused 22/22와 전체 단위 451 PASS·1 SKIP·0 FAIL, Harness PASS다. 현재 P6 미완료 상태에서는 approval receipt read/verify·lease·child·write 모두 0건이다.
- `ACC-P7-31`을 완료했다. P6 actual 완료 뒤 외부 OPERATIONS_OWNER 승인에 필요한 release/run·P6 cutover SHA·P6 OPERATIONS 서명 SHA·현재 activation bundle·19단계·10행위·MFA·최대 45일 계약을 수작업 전사하지 않고 exact unsigned payload로 조립한다. 저장소 밖 물리 신규 경로에 hard-link no-replace로 한 번만 쓰며 승인·서명·MFA·메시지는 만들지 않는다. 구현 전 4건 예상 실패, 구현 후 focused 4/4와 전체 단위 455 PASS·1 SKIP·0 FAIL, Harness PASS다. 현재 P6 미완료 상태에서는 input read·write·approval·message 모두 0건이다.
- `ACC-P7-32`를 완료했다. 외부 MFA approval receipt를 받은 뒤 실행용 manifest의 release/run·P6 SHA·운영 서명 SHA·bundle·identity·19단계·10행위를 다시 수작업하던 공백을 닫았다. unsigned request·receipt·P6 actual·현재 bundle을 exact 교차검증하고 receipt signedAt부터 최대 45일인 manifest를 저장소 밖에 hard-link no-replace로 한 번만 쓴다. 구현 전 5건 예상 실패, 구현 후 focused 5/5와 전체 단위 460 PASS·1 SKIP·0 FAIL, Harness PASS다. 현재 P6 미완료 상태에서는 input read·write·approval·signature·message·activation 모두 0건이다.
- `ACC-P7-33`을 완료했다. 실제 승인 파일이 생긴 뒤 activation `--execute`에서야 처음 전체 체인 오류가 드러나던 공백을 닫았다. 읽기 전용 preflight가 P6 cutover·request·MFA receipt·manifest·현재 bundle의 content/SHA·identity·run·release·19단계·10행위·45일 만료를 실행 전에 검증한다. 구현 전 4건 예상 실패, 구현 후 focused 4/4와 전체 단위 464 PASS·1 SKIP·0 FAIL, Harness PASS다. 현재 P6 미완료 상태에서는 input read·lease·child·receipt·write 모두 0건이다.
- `ACC-P7-34`를 완료했다. request builder·합성 MFA receipt·manifest builder·read-only preflight를 저장소 밖 임시 물리 JSON 4개로 종단 연결해 단계별 계약이 실제 파일 bytes/SHA로 호환됨을 증명했다. request identity·receipt bundle·manifest expiry 변조 3/3을 차단하고 성공·변조 경로 모두 임시 산출물을 남기지 않는다. 구현 전 3건 예상 실패, 구현 후 focused 3/3와 전체 단위 467 PASS·1 SKIP·0 FAIL, Harness PASS다. 합성 결과는 실제 승인·activation·Production GO로 승격되지 않는다.
- `ACC-P7-35`를 완료했다. 물리 승인 문서 4개를 read-only preflight 뒤 오케스트레이터 approval validator·receipt-root claim·첫 `slo-collect` PASS receipt까지 연결하고 다음 단계가 `slo-compile`인지 검증했다. 총 물리 문서 6개, manifest·MFA receipt·bundle 변조 3/3 차단, unrelated Secret·GitHub token·`NODE_OPTIONS` child 전달 0건, 임시 산출물 0건이다. 합성 리허설이며 child·실제 승인·activation·외부 변경·Production GO는 실행하지 않았다.
- `ACC-P7-36`을 완료했다. 동일 승인 SHA·receipt-root에서 19개 activation 단계의 합성 PASS receipt를 정확한 순서로 물리 기록해 마지막 선택이 `PASS_OPERATIONS_ACTIVATION_SEQUENCE_COMPLETE`인지 확인했다. 물리 문서 24개, sequence·approval provenance·마지막 receipt 완결성 변조 3/3 차단, 임시 산출물 0건이다. child·공급자·DB·GitHub·Phase 변경과 실제 activation은 실행하지 않았다.
- `ACC-P7-37`을 완료했다. 19개 activation 단계마다 attempt 1 WAIT와 attempt 2 PASS를 물리 receipt로 기록하고 동일 단계 재선택 19/19 및 최종 sequence complete를 확인했다. receipt 38개·물리 문서 43개, attempt gap·terminal PASS 뒤 receipt·교차 run 변조 3/3 차단, 임시 산출물 0건이다. WAIT는 실패로 세지 않았고 실제 child·외부 변경은 실행하지 않았다.
- `ACC-P7-38`을 완료했다. 19개 activation 단계 각각을 실패 표적으로 삼아 앞 단계 PASS 뒤 동일 FAIL 3회에서 정확히 정지하고 이후 단계 receipt 0건을 확인했다. 19/19 격리, receipt 228개·물리 문서 251개, 실패 2회·4회·교차 run 변조 3/3 차단, 임시 산출물 0건이다. 실제 child·외부 변경은 실행하지 않았다.
- `ACC-P7-39`를 완료했다. 실제 activation 진입점의 child 실행·JSON 판정·allowlist 환경·물리 receipt 기록을 process runner 모듈로 고정하고 합성 child 19건으로 sequence complete까지 연결했다. receipt 19개·물리 문서 36개, 예상 밖 환경 전파 0건, malformed JSON·exit 1·timeout PASS-text·민감 출력 부정 시나리오 4/4, bounded 대체 프로필 2/2, Secret 원문 출현 0건, 임시 산출물 0건이다. 실제 child·외부 변경은 실행하지 않았다.
- `ACC-P7-40`을 완료했다. 실제 Node activation child의 timeout·출력 한도 초과를 제한된 실패 상태로 정규화하고 spawn 오류·signal 종료도 같은 bounded 상태 계약으로 분리했다. 오류 객체·stdout/stderr 원문은 receipt에 기록하지 않으며 timeout 중 PASS 형태 stdout도 FAIL로 고정한다. focused 27/27, 구문 309/309, 저장소 단위 485 PASS·Windows symlink 1 SKIP이며 현재 activation bundle은 물리 파일 44개, SHA-256 `0534b2fc044809d14baa1236b7342b5dfe1362c7434b6cfc9af2db8dc32816c7`이다. 실제 Production child·외부 변경은 `NOT_RUN`이다.
- `ACC-P7-41`을 완료했다. 마지막 연속 동일 timeout·출력 한도 실패가 정확히 2회인 세 번째 시도에만 각각 4시간·4MiB bounded 대체 프로필을 적용한다. 실행 프로필은 물리 receipt에 기록되며 이전 receipt 체인에서 재계산한 기대값과 다르면 재개를 거부한다. 혼합 실패·1회 실패·spawn·signal에는 표준 프로필을 유지하고 세 번째 실패 후 기존 PAUSED 정책을 적용한다. failure-first 3건, focused 31/31, 구문 309/309, 저장소 단위 489 PASS·Windows symlink 1 SKIP이며 현재 bundle은 물리 파일 44개, SHA-256 `f4b615ff493f0768dc520a46e02bb62026e85997c69065ecc100a8b29a688c1a`이다. 실제 Production child·외부 변경은 `NOT_RUN`이다.
- `ACC-P6-21`을 완료했다. `production:cutover-preflight`의 외부 명령을 각 10초·1MiB로 제한하고 Cloudflare tunnel timeout·실패·비정상 JSON을 오류 원문 없이 local blocker로 고정했다. 무응답 재현 뒤 focused 7/7, 구문 311/311, 저장소 단위 492 PASS·Windows symlink 1 SKIP, 저장소 위생이 통과했다. 실제 preflight는 기존 `sqcm-i`·`sqcm-i-inventory-staging` tunnel 보존과 local blocker 0을 확인해 `READY_WAIT_CHANGE_WINDOW`를 약 5초 내 반환했으며 DNS/TLS·tunnel·계정 변경은 0건이다.
- `ACC-P6-22`를 완료했다. 실제 ingress publication의 Cloudflare CLI·PowerShell 관측을 10초·1MiB, API를 10초, DNS를 5초로 제한했다. timeout·provider 실패·비정상 응답은 오류·Secret 원문 없이 닫히고 초기 DNS 관측 실패는 tunnel·config·connector·DNS 변경 전에 차단된다. failure-first 4건, focused 11/11, 구문 313/313, 저장소 단위 496 PASS·Windows symlink 1 SKIP이며 dry-run은 rollback token 참조 대기·외부 변경 0건을 유지했다. 실제 ingress 게시·DNS/TLS 변경은 `NOT_RUN`이다.
- `ACC-P6-23`을 완료했다. rollback 격리의 `production:route-disable`에서 Cloudflare tunnel CLI를 10초·1MiB, API를 10초, DNS를 5초로 제한했다. 초기 tunnel 관측 실패는 token read·DNS API 전에 차단되고 삭제 뒤 provider·DNS 확인 실패는 변경 가능성을 보수적으로 남긴다. failure-first 4건, focused 10/10, 구문 315/315, 저장소 단위 500 PASS·Windows symlink 1 SKIP이며 dry-run은 tunnel 없음·token 참조 대기·외부 변경 0건을 유지했다. 실제 route 삭제는 `NOT_RUN`이다.
- `ACC-P6-24`를 완료했다. Gate 5 `production:public-probe`의 A·CNAME 관측을 5초로 제한하고 exact HTTPS 5경로를 각각 10초 상한으로 동시에 실행하도록 보완했다. DNS 관측 실패는 HTTP 호출 전에 차단되고 endpoint timeout·오류 원문은 기록하지 않는다. failure-first 4건, focused 8/8, 구문 317/317, 저장소 단위 504 PASS·Windows symlink 1 SKIP이며 dry-run은 DNS 미게시·HTTPS 호출 `NOT_RUN`·외부 변경 0건을 유지했다.
- `ACC-P6-25`를 완료했다. `production:role-core-smoke`의 모든 HTTP 요청을 10초로 제한하고 timeout·network·JSON 오류를 credential·응답 원문 없이 fail-closed하도록 보완했다. MFA 뒤 중간 실패는 활성 시험 세션의 logout cleanup을 시도한다. failure-first 4건, focused 15/15, 구문 319/319, 저장소 단위 509 PASS·Windows symlink 1 SKIP이며 dry-run은 세 역할 credential 참조 대기·실제 로그인 `NOT_RUN`·외부 변경 0건을 유지했다.
- `ACC-P6-26`을 완료했다. `production:authenticated-idempotency`의 HTTP 요청과 Docker 조회·SQL을 각각 10초, process 출력을 1MiB로 제한했다. timeout·network·process·JSON 오류는 credential·provider·stdout/stderr 원문 없이 닫고 중간 실패에도 marker 기반 DB cleanup과 logout을 각각 시도한다. failure-first 5건, focused 16/16, 구문 321/321, 저장소 단위 516 PASS·Windows symlink 1 SKIP이며 dry-run은 ADMIN credential·쓰기 확인 대기, HTTP·process·DB 변경 0건을 유지했다.
- `ACC-P6-27`을 완료했다. `production:uat-actor-provision`의 Docker 관측·copy·cleanup을 10초, transaction worker를 60초, 출력을 1MiB로 제한했다. timeout·process·worker JSON·cleanup 오류는 credential·stdout/stderr 원문 없이 닫고 임시 worker 삭제 확인 전에는 성공을 출력하지 않는다. failure-first 5건, focused 12/12, 구문 323/323, 저장소 단위 521 PASS·Windows symlink 1 SKIP이며 dry-run은 승인·세 credential 참조 대기, process·계정·DB 변경 0건을 유지했다.
- `ACC-P6-28`을 완료했다. `production:role-preflight`의 Production database container와 role/MFA SQL 조회를 각각 10초·1MiB로 제한했다. timeout·process·container·SQL 파싱 오류는 stdout/stderr 원문 없이 닫고 malformed·duplicate·unknown role 행은 fail-closed한다. failure-first 5건, focused 9/9, 구문 325/325, 저장소 단위 526 PASS·Windows symlink 1 SKIP이며 실제 읽기 실행은 세 역할 active·MFA 0명, credential 참조 0/3, DB 쓰기 0건을 유지했다.
- `ACC-P6-29`를 완료했다. `production:provider-preflight`의 backend container 조회를 10초, 5종 provider probe를 최대 150초, 출력을 1MiB로 제한했다. timeout·process·container·observation JSON 오류는 stdout/stderr·provider 오류 원문 없이 닫는다. failure-first 5건, focused 8/8, 구문 327/327, 저장소 단위 531 PASS·Windows symlink 1 SKIP이며 실제 읽기 probe는 PostgreSQL storage·Defender bridge·AI health/readiness·loopback event publisher 5종 PASS, 외부 변경 0건이다.
- `ACC-P6-30`을 완료했다. `production:csrf-idempotency-baseline`의 negative login HTTP·Docker·SQL을 각각 10초, process 출력을 1MiB로 제한하고 container·count·5열 schema 결과를 엄격 파싱한다. failure-first 6건, focused 6/6, 구문 329/329, 저장소 단위 537 PASS·Windows symlink 1 SKIP이며 실제 baseline은 403 `CSRF_INVALID`, 세션 수 불변, schema 10/10·unique index 1·stuck/invalid 0을 확인했다. 실제 인증 쓰기 replay는 `NOT_RUN`이다.
- `ACC-P6-31`을 완료했다. Harness 부하에서 반복된 ingress native DNS timeout에 대해 native A·CNAME 실패 때만 Cloudflare 공개 DoH A·CNAME authoritative 응답을 대체 사용하도록 보완했다. published/NXDOMAIN 충돌, 두 경로 실패와 provider 오류는 fail-closed한다. failure-first 4건, focused 7/7, 구문 330/330, 저장소 단위 541 PASS·Windows symlink 1 SKIP이며 실제 ingress preflight는 mutation 0·`READY_WAIT_INGRESS_PUBLICATION_INPUTS`다.
- `ACC-P6-32`를 완료했다. `production:log-gate`의 Docker container·backend log·outbox SQL 조회를 10초로 제한하고, 일반 출력은 1MiB·로그는 4MiB로 제한했다. malformed JSON과 정확히 두 개 비음수 정수가 아닌 outbox 결과는 원문 없이 fail-closed한다. failure-first 6건, focused 9/9, 구문 332/332, 저장소 단위 547 PASS·Windows symlink 1 SKIP이며 실제 읽기 기준선은 5xx·fatal·error·outbox retry/dead-letter 0건이다. 변경창 후 실제 재검사는 `NOT_RUN`이다.
- `ACC-P6-33`을 완료했다. `production:nonfunctional-baseline` child를 120초·1MiB로 제한하고 unrelated Secret 환경과 raw stderr 상속을 제거했다. exit 0 외에도 exact target·60요청·오류율 0·p95 1000ms 이하·보안 헤더·익명 401·cross-site 403을 엄격 파싱하고 모든 HTTP에 10초 상한을 적용한다. failure-first 6건, focused 10/10, 구문 334/334, 저장소 단위 553 PASS·Windows symlink 1 SKIP이며 실제 loopback은 60요청 오류 0·p95 13ms·보안 계약 PASS다. 공개 부하 Gate는 `NOT_RUN`이다.
- `ACC-P6-34`를 완료했다. `production:operational-health-baseline`의 Docker container·SQL·backend log 조회를 10초, 일반 출력은 1MiB·로그는 4MiB로 제한했다. 단일 container·3개 비음수 counter·JSON log를 엄격 파싱하고 physical backup의 실제 byte 수와 streaming SHA-256을 검증한다. failure-first 7건, focused 11/11, 구문 336/336, 저장소 단위 560 PASS·Windows symlink 1 SKIP이며 실제 loopback은 health/readiness 200, counter·5xx 0, 238,533-byte backup checksum·restore PASS다. post-cutover Gate는 `NOT_RUN`이다.
- `ACC-P6-35`를 완료했다. `production:rollback-readiness`의 Docker `ps`·`inspect`·`volume ls`를 각각 10초·1MiB로 제한하고 단일 container ID·inspect identity·40자리 revision·비어 있지 않은 image·중복 없는 유효 volume 이름을 엄격 파싱한다. failure-first 6건, focused 10/10, 구문 338/338, 저장소 단위 566 PASS·Windows symlink 1 SKIP이며 실제 loopback은 revision 2/2·named volume 2/2·과거 drill·backup/restore·cutoff·route-removal 계약 PASS다. 실제 post-cutover rollback은 `NOT_RUN`이다.
- `ACC-P6-36`을 완료했다. `production:signoff-preflight`는 역할 결과 3건과 업무·보안·운영 서명 3건을 저장소 밖 절대경로의 서로 다른 physical JSON regular file로만 인정한다. 상대경로·저장소 내부·symlink/reparse·디렉터리·빈 파일·1MiB 초과·physical 중복 reference를 차단한다. failure-first 5건, focused 8 PASS·Windows symlink 1 SKIP, 구문 340/340, 저장소 단위 570 PASS·Windows skip 2건이며 현재 실제 reference는 0/6, 실제 서명은 `NOT_RUN`이다.
- `ACC-P6-37`을 완료했다. `production:cutover-finalizer`와 `production:phase-promotion`을 저장소 밖 absolute physical JSON object만 4MiB 이하로 읽는 단일 reader에 결합했다. real path 일치·actual bytes·SHA-256을 검증하고 저장소 내부·symlink/reparse·parent redirect·빈/과대·malformed/array 입력을 원문 없이 차단한다. failure-first 5건·Windows symlink 1 SKIP, focused 10 PASS·1 SKIP, 구문 341/341, 저장소 단위 575 PASS·3 SKIP이며 actual evidence가 없어 두 진입점 모두 WAIT·변경 0건이다.
- `ACC-P7-16`을 완료했다. P7 handover finalizer·manifest assembler·8/8 terminal completion을 저장소 밖 physical JSON object 전용 4MiB bounded reader에 결합했다. 최상위 상대경로, 하위 상대경로 탈출, 저장소 내부, symlink/reparse·parent redirect, 빈/과대·malformed/array 입력을 redacted 상태로 차단하고 actual bytes·SHA-256을 계산한다. failure-first 6건·Windows symlink 1 SKIP, focused 21 PASS·1 SKIP, 구문 342/342, 저장소 단위 582 PASS·4 SKIP이다. Harness에서 native DNS timeout이 두 번 재현되어 기존 authoritative DoH 대체 관측을 public probe에 연결했고 전체 Harness가 PASS했다. 실제 handover 입력·P7 활성화·8/8 전환은 `NOT_RUN`이다.
- `ACC-P7-42`를 완료했다. P7 activation의 P6 actual evidence·unsigned approval request·OPERATIONS_OWNER MFA receipt·approval manifest와 재개 receipt를 저장소 밖 absolute physical JSON object 전용 4MiB bounded reader에 결합했다. 저장소 내부·symlink/reparse·parent redirect·빈/과대·malformed/array 입력을 원문 없이 차단하고 actual bytes·SHA-256을 계산한다. failure-first 5건, focused 42 PASS·Windows symlink 1 SKIP, 구문 344/344, 저장소 단위 587 PASS·5 SKIP이며 네 실제 진입점은 P6 완료 전 input read·child·lease·receipt·외부 변경 0건으로 WAIT한다. 실제 승인·activation은 `NOT_RUN`이다.
- `ACC-P7-43`을 완료했다. Operations signoff assembler의 P6 actual cutover·운영 8영역·OPERATIONS_OWNER approval receipt 10개 입력을 같은 저장소 밖 absolute physical JSON object 전용 4MiB bounded reader에 결합했다. actual bytes·SHA-256을 조립 provenance로 사용하며 P6 완료 전에는 10개 입력을 읽지 않는다. failure-first 1건, focused 13 PASS·Windows symlink 1 SKIP, 구문 344/344, 저장소 단위 588 PASS·5 SKIP이며 실제 운영 서명 조립·외부 변경은 `NOT_RUN`이다.
- `ACC-P7-44`를 완료했다. SLO·경보·백업/복원·인증서·온콜·유지보수·개선큐·운영서명 compiler 8개의 actual 입력을 같은 저장소 밖 absolute physical JSON object 전용 4MiB bounded reader에 결합했다. 각 영역 provenance에는 actual bytes·SHA-256만 사용한다. failure-first 8건, focused 64/64, 구문 345/345, 저장소 단위 596 PASS·5 SKIP이며 여덟 기본 진입점은 증거 생성 0건으로 P6 완료를 기다린다. 실제 운영 증거 생성은 `NOT_RUN`이다.
- `ACC-P7-45`를 완료했다. Alert delivery·off-site backup/restore·on-call drill·improvement queue runner의 provider manifest·approval attestation 4개 제어 JSON을 같은 저장소 밖 absolute physical JSON object 전용 4MiB bounded reader에 결합했다. failure-first 4건, focused 30/30, 구문 346/346, 저장소 단위 600 PASS·5 SKIP이며 네 기본 진입점은 Secret 사용·외부 변경 0건으로 P6 actual cutover를 기다린다. 실제 runner 실행은 `NOT_RUN`이다.
- `ACC-P7-46`을 완료했다. Alert delivery·on-call drill·improvement queue runner의 credential 파일 3건을 저장소 밖 absolute physical UTF-8 전용 64KiB bounded Secret reader에 결합했다. 저장소 내부·symlink/reparse·parent redirect·빈/과대·invalid UTF-8을 원문 없이 차단한다. failure-first 4건, focused 28 PASS·Windows symlink 2 SKIP, 구문 347/347, 저장소 단위 603 PASS·6 SKIP이며 세 기본 진입점은 Secret read·외부 변경 0건으로 P6 actual cutover를 기다린다.
- `ACC-P7-47`을 완료했다. SLO JSONL 원장을 저장소 밖 absolute physical UTF-8 전용 64KiB bounded reader에 결합하고 P6 actual cutover 전 content read를 0건으로 고정했다. append와 30일 export 재읽기도 같은 경계를 사용한다. failure-first 3건, focused 16 PASS·Windows symlink 2 SKIP, 구문 348/348, 저장소 단위 606 PASS·6 SKIP이며 기본 진입점은 `sampleCount=0`, HTTP read·write 0건으로 대기한다.
- `ACC-P7-48`을 완료했다. P7 maintenance Docker 호출을 10초·기본 1MiB·로그 4MiB로 제한하고 exact Production physical backup manifest를 fatal UTF-8 JSON object·64KiB 이하·actual bytes/SHA-256으로 읽으며 dump bytes·streaming SHA-256을 검증한다. failure-first 5건, focused 21/21, 구문 349/349, 저장소 단위 611 PASS·6 SKIP이다. 기본 maintenance는 HTTP/runtime read·write 0건으로 P6를 기다리고 P6 operational-health는 238,533-byte backup checksum·restore와 함께 PASS했다.
- `ACC-P7-49`를 완료했다. P7 backup/restore의 container discovery 10초, metadata 60초, snapshot·restore 60분, dump 30분과 stderr 64KiB·capture 4MiB 상한을 적용했다. timeout·출력·stream 실패는 child 종료와 원문 없는 상태로 닫고 dump/restore는 streaming한다. failure-first 5건, focused 11/11, 구문 351/351, 저장소 단위 616 PASS·6 SKIP, GitHub quality `33580854494`가 PASS했다. 기본 runner는 Production read·off-site write·격리 DB mutation 0건으로 P6 actual cutover를 기다린다.
- `ACC-P7-13`을 완료했다. `operations:evidence-pipeline-rehearsal`은 합성 전용 임시 공간에서 8개 운영 영역 compiler, 운영 서명 compiler, schema 2 manifest assembler와 finalizer를 한 흐름으로 연결해 10/10 문서 호환을 증명한다. 조립 뒤 backup/certificate 파일 변조는 SHA 불일치로 차단되고 성공·차단 경로 모두 임시 디렉터리를 남기지 않는다. focused 4/4, 저장소 구문 221개와 단위 316/316이 PASS했으며 합성 결과는 실제 증거·서명·Production GO로 승격되지 않는다.
- 가속 큐의 다음 READY는 계속 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`다. 이는 P6 G4 실제 완료 후에만 실행 가능한 외부 입력 Gate다.

- P6-G4는 `READY_WAIT_CHANGE_WINDOW`다. 승인된 공개 전환 창은 `2026-09-11 20:00~23:00 KST`, rollback cutoff는 22:00다.
- 내부 Production 3서비스·smoke·migration 25/25·백업 복원은 정상이고 배포 후보와 원격 브랜치 SHA도 일치한다.
- `inventory.safe-link.co.kr`은 A/CNAME 모두 NXDOMAIN이며 HTTPS host를 찾을 수 없다. Cloudflare에는 기존 `sqcm-i`와 `sqcm-i-inventory-staging` tunnel만 있고 Production 전용 tunnel은 없다.
- Production 사용자 수는 0이다. 실제 ADMIN·MANAGER·USER 로그인·MFA·RBAC와 업무·보안·운영 서명은 `NOT_RUN`이다.
- 변경창 전에는 기존 tunnel·DNS·TLS를 변경하지 않는다. 자동 실행은 내부 health·백업·SHA·보호 서비스 드리프트를 재검사한다.
- `npm.cmd run production:cutover-preflight`를 추가해 원격 SHA, Production 3서비스·포트, smoke, migration·사용자 수, 백업 복원, 보호 PID, Cloudflare tunnel, DNS와 변경창을 한 번에 판정한다. 회귀 4/4와 Harness 등록이 PASS했다.
- `npm.cmd run production:provider-preflight`는 Production 컨테이너 내부에서 Secret 출력 없이 PostgreSQL 저장소, Defender/경보, AI health·ready, event publisher를 읽기 전용 검사해 PASS했다.
- `npm.cmd run production:public-probe`는 DNS 미게시를 변경창 대기로 유지하고, 변경창 밖 조기 게시를 차단하며, 변경창 안에서 TLS·hostname과 외부 5경로 상태를 exact 검사하도록 준비됐다. 현재 실제 공개 probe는 `NOT_RUN`이다.
- `npm.cmd run production:ingress-publication`은 `safe-link.co.kr`·`inventory.safe-link.co.kr`·`sqcm-i-inventory-production`·`127.0.0.1:3300`을 exact 고정한다. `--execute`는 변경창 안에서 origin health를 재검사하고, tunnel이 없을 때만 생성하며, 기존 config가 다르면 덮어쓰지 않고, connector 연결 뒤 정확한 proxied CNAME만 생성한다. 기존 tunnel·staging·loopback 서비스·volume은 보존한다.
- `npm.cmd run production:log-gate`는 최근 15분 backend 5xx·치명 오류·error level과 outbox retry/dead-letter 기준선을 검사하고, 변경창에는 20:00 이후 전체 구간을 실제 Gate로 재검사한다. 현재는 pre-cutover 기준선만 판정한다.
- `npm.cmd run production:role-preflight`는 Production DB의 ADMIN·MANAGER·USER active/MFA 수와 역할별 credential file reference 존재만 읽어 core smoke 선행조건을 fail-closed 판정한다. 현재 각 역할 active/MFA 0명, 참조 0/3으로 `READY_WAIT_ROLE_USERS_MFA_AND_CREDENTIAL_REFERENCES`이며 Secret 원문은 읽거나 기록하지 않는다.
- `npm.cmd run production:uat-actor-provision`은 exact 승인 파일, 역할별 이메일·비밀번호·TOTP reference와 확인 문자열을 요구한다. Production backend 이미지의 `pg`·`bcryptjs`·MFA service import, 임시 worker 경로와 필요한 DB column 28/28을 읽기 전용 확인했다. 실행 시 marker가 다른 기존 이메일은 덮어쓰지 않고 transaction 전체를 rollback하며 임시 worker를 제거한다.
- `npm.cmd run production:role-core-smoke -- --public`은 승인 변경창과 exact 확인 문자열이 모두 있을 때만 공개 Production MFA/RBAC 역할 스모크를 실행한다. 변경창 밖 공개 실행은 종료코드 1로 차단되고 loopback 성공은 `PASS_LOOPBACK_ROLE_CORE_SMOKE_BASELINE`·실제 Production `NOT_RUN`으로 분리되며 회귀 6/6이 통과했다.
- `npm.cmd run production:nonfunctional-baseline`은 `127.0.0.1:3300`에 60요청/동시성 6 부하와 보안 헤더·익명 401·cross-site 403을 검사한다. 이는 loopback 기준선이며 공개 HTTPS 대상의 변경창 재검사는 `NOT_RUN`으로 유지한다.
- `npm.cmd run production:nonfunctional-baseline -- --public`은 승인 변경창과 exact 확인 문자열이 모두 있을 때만 `https://inventory.safe-link.co.kr`을 대상으로 같은 부하·보안 검사를 실행한다. 변경창 밖 공개 실행은 fail-closed로 차단되며 회귀 4/4가 통과했다.
- `npm.cmd run production:operational-health-baseline`은 loopback health/readiness, Production DB의 old outbox·expired session·stuck idempotency, 최근 15분 5xx, 최신 Production backup checksum/age와 restore drill/age를 한 번에 검사한다. 현재 기준선은 PASS이고 변경창 이후 재검사는 `NOT_RUN`이다.
- `npm.cmd run production:operational-health-baseline -- --public`은 승인 변경창과 exact 확인 문자열이 있을 때 공개 `https://inventory.safe-link.co.kr` health/readiness와 같은 내부 DB·로그·백업·복원 증거를 결합한다. 변경창 밖 실행은 fail-closed로 차단되며 회귀 4/4가 통과했다.
- `npm.cmd run production:csrf-idempotency-baseline`은 동일 출처 missing-CSRF 요청이 403/`CSRF_INVALID`이고 세션을 만들지 않는지, idempotency 테이블 10열·사용자/키 unique index와 stuck/invalid 0건을 검사한다. 실제 인증 사용자 정상 쓰기·동일 키 replay는 시험계정이 없어 `NOT_RUN`이다.
- `npm.cmd run production:authenticated-idempotency -- --public`은 승인 변경창과 exact 쓰기 확인 문자열이 있을 때만 `https://inventory.safe-link.co.kr`의 인증 CSRF/idempotency 쓰기·replay·conflict·DB 단일 행·감사·정리를 실제 Production Gate로 판정한다. 변경창 밖 실행은 종료코드 1로 차단되며 target·증거 분리 회귀 5/5가 통과했다.
- `npm.cmd run production:rollback-readiness`는 현재 backend/frontend revision, PostgreSQL·파일 named volume 2/2, G3 실제 중지/포트폐쇄/복구 drill, backup/restore, 22:00 cutoff와 Production 전용 route 제거 순서를 대조한다. dry-run readiness는 PASS지만 공개 전환 후 실제 rollback은 `NOT_RUN`이다.
- `npm.cmd run production:route-disable`는 `safe-link.co.kr`의 `inventory.safe-link.co.kr` CNAME이 정확히 `sqcm-i-inventory-production` tunnel ID를 가리키는 경우만 Cloudflare API 삭제 후보로 인정한다. `--execute`는 승인 변경창과 exact 확인 문자열, 최소 권한 token file reference를 모두 요구한다. 현재 tunnel과 token reference가 없어 `READY_WAIT_ROUTE_DISABLE_INPUTS`이고 API 호출·토큰 읽기·DNS 삭제·tunnel/서비스 중지는 0건이다. 회귀 6/6이 통과했다.
- `npm.cmd run production:signoff-preflight`는 ADMIN·MANAGER·USER Production UAT 결과와 업무·보안·운영 서명 파일 참조 6건, cutover 후보의 PENDING 상태와 변경창을 fail-closed로 검사한다. 현재 참조 0/6, 실제 서명 `NOT_RUN`으로 `READY_WAIT_PRODUCTION_UAT_AND_SIGNOFF_REFERENCES`이며 파일 내용·Secret은 읽거나 기록하지 않는다.
- `npm.cmd run production:cutover-evidence`는 12개 Gate 중 실제 로컬 증거가 있는 artifact·backup/restore·migration·provider preflight 4건만 PASS로 조립한다. 외부 Production 8건과 역할 결과·서명은 PENDING이며 후보는 fail-closed 검증상 Production을 승인할 수 없다.
- 저장소 표준 검증에서 JavaScript 구문 223개와 단위 321/321이 PASS했으며 active branch provenance, preflight·UAT actor transaction provision·exact ingress publication·공개 probe·로그·loopback 및 변경창 공개 역할 MFA/RBAC·인증 CSRF/idempotency·nonfunctional·operational health runner·rollback readiness·정확한 Cloudflare route disable·12-Gate 실패 매트릭스·최종 서명 Gate·증거 조립·실제 cutover 전체 계약 finalizer·P7 운영 인수 10문서 SHA bundle validator·atomic assembler, 운영 8영역·운영 책임자 actual evidence compiler와 합성 종단 리허설 회귀가 검증 봉투에 포함된다.

## 2026-09-01 P6-G3 AI PC Production 배포·복구

- 후보 SHA `e238ab8dab7f4729298ceb7ecc0f874a4a08829a`의 GitHub-hosted quality run `33469721441`과 release-images run `33469730466`이 성공했다.
- 별도 Compose project `seowon-inventory-production`의 frontend/backend/database 3서비스가 healthy이며 frontend만 `127.0.0.1:3300`에 공개된다. backend와 PostgreSQL 16은 호스트 포트가 없다.
- application migration 25/25, public table 54, Production 사용자 0, seed 미실행을 확인했다. health·readiness·정적자산은 200이고 미인증 업무 API는 401이다.
- 논리 백업의 SHA-256을 확인하고 임시 DB에 복원해 필수 테이블 33/33, migration 25/25와 행 수 일치를 검증했다.
- 실제 3서비스 중지 rollback으로 3300 포트 폐쇄와 두 named volume 보존을 확인한 뒤 같은 digest 이미지로 재기동·스모크를 재통과했다.
- staging 3서비스와 보호 포트/PID `1234/6632`, `11434/8588`, `18765/22716`, `18766/65724`는 보존됐다.
- 공개 DNS/TLS, 실제 Production 사용자 로그인·MFA, 최종 서명은 아직 없으므로 `productionGo=false`다. 다음 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`다.

## 2026-09-01 P6-G2 GitHub-hosted CI·불변 이미지

- 정확한 47파일 allowlist를 후보 SHA `a73dda495e8365612c24cd9c9f4070a9aa8548e6`로 commit·push했고 원격 브랜치와 일치한다. 금지 파일과 Secret 서명은 각각 0건이다.
- Draft PR [#23](https://github.com/visionlab-coder/sqcm-i-inventory-system/pull/23)을 생성했다. main merge·release는 실행하지 않았다.
- 후보 SHA의 GitHub-hosted `quality #45` run `33466804085`와 `release-images #9` run `33466895762`가 성공했다.
- backend OCI index digest는 `sha256:8de4fb1545deb2fd2bdbfbf1c7752709921f8d11914cba79d01ccecb915efd3d`, frontend는 `sha256:dc41a39f871289a3382e1c48bb263b656158ca92b7a94da37f111519a8e0f49d`다. 둘 다 `linux/amd64`, `linux/arm64`와 provenance attestation을 포함한다.
- staging 3서비스와 보호 포트/PID는 보존됐다. Production Secret·migration·배포·DNS/TLS는 0이며 `productionGo=false`다.
- 다음 READY는 `P6-G3-AI-PC-PRODUCTION-SECRETS-MIGRATION-DEPLOY-AND-ROLLBACK`이다.

## 2026-09-01 P6-G1 무료 PostgreSQL Production 오버레이

- 사용자는 OCI 경로를 폐기하고 AI PC PostgreSQL 운영을 승인했다. OCI 계정·카드·VM은 생성하지 않으며 외부 클라우드 결제수단은 필요하지 않다.
- AI PC는 24 logical CPU, RAM 약 64GB, D: 여유 약 1.81TB지만 관찰 시 여유 RAM은 약 12GB다. 단일 호스트 장애와 SQCM-i 37봇·다른 Docker project와의 자원 경합 위험을 수용해야 한다.
- `compose.ai-production.yaml`은 `seowon-inventory-production` 전용 project, frontend `127.0.0.1:3300`, backend/database 호스트 포트 0, 세 서비스 합계 4.5 CPU·4.25GB 상한을 강제한다. 실제 Production 컨테이너와 볼륨은 아직 만들지 않았다.
- 구문 128개, 단위 149/149, application migration 25/25, AI PC Production 계약, Compose 3서비스, UI 계약 20개, staging 3서비스 health와 Harness verify가 PASS해 P6-G1을 닫았다.
- 사용자는 Supabase 유료 전환을 철회하고 무료 운영, 불가 시 PostgreSQL 전환을 결정했다. Pro checkout은 확정 전에 닫았고 조직은 Free이며 결제·카드 입력·Production project 생성은 0이다.
- 업무 DB는 기존부터 PostgreSQL 16이므로 전용 Production VM의 `database` 서비스를 정본으로 유지한다. Supabase staging `iuoljos…`는 변경 없이 `ACTIVE_HEALTHY`로 보존한다.
- application migration `026_postgres_file_blobs.sql`과 `PostgresFileStore`를 추가해 증빙 파일을 PostgreSQL `BYTEA`로 보관한다. backup·restore·maintenance 필수 테이블에도 `file_blobs`를 포함했다.
- Production 로컬 인증은 `PRODUCTION_LOCAL_AUTH_MFA_REQUIRED=true`일 때만 허용하며 MFA 미등록 계정은 세션 발급 전에 차단한다. cutover 전 실제 사용자 MFA 등록·복구코드 인수가 필요하다.
- 구문 126, 단위 148/148, application migration 25/25, PostgreSQL 파일 write/read/delete/health, Production deploy precheck, Compose 3서비스, UI 계약 20이 통과했다.
- staging 3서비스와 LM Studio `1234/PID 6632`, Ollama `11434/PID 8588`, bridge/wslrelay `18765/PID 22716`은 보존됐다.
- OCI Free Tier 가입 화면을 열고 비필수 쿠키를 거절했다. 무료 전용 결정을 우선해 Seoul `ap-seoul-1` Ampere A1 총 2 OCPU·12GB·100GB를 후보로 고정했다. 4 OCPU·24GB는 Free-only 한도가 아니며 Pay As You Go·유료 Add-on·과금 가능 리소스는 승인하지 않는다.
- OCI A1 ARM64 대응을 위해 release workflow의 backend/frontend를 `linux/amd64,linux/arm64`로 보완했다. 원격 Actions·image manifest는 NOT RUN이다.
- 남은 P6-G1 외부 입력은 OCI 법적 이름·실사용 이메일·주소·전화·카드 신원확인, Seoul home region, 실제 VM·reserved IP·runner, PostgreSQL backup/WAL·off-site·RPO/RTO다. 개인정보·카드 원문은 사용자가 화면에 직접 입력하며 저장소에 기록하지 않는다. 현재 변경은 로컬 미커밋이고 Production DNS/TLS·Secret·migration·배포·과금은 0이다.

## 2026-09-01 P6-G1 Supabase 생성 시도 역사 증거

- 현재 후보 `0d892f0b…`는 원격 `codex/fix-sidebar-accessibility`와 일치하고 확인 시 worktree는 clean이었다.
- 이 SHA의 open PR과 Actions run은 각각 0이다. 이전 SHA의 성공 CI를 현재 후보 CI로 승격하지 않는다.
- Supabase `sqcm-i-inventory` 조직은 Free plan이며 staging `iuoljos…`는 Singapore에서 `ACTIVE_HEALTHY`다. Production은 별도 project로 분리한다.
- 신규 project의 현재 비용 조회는 USD 0/month지만 사용자의 비용 이해 확인 전 생성하지 않는다. Free plan은 Production backup/PITR 수용 증거가 아니므로 plan·retention·RPO/RTO를 별도 결정한다.
- `inventory.safe-link.co.kr`과 Seoul region을 권장 후보로 기록했다. DNS/TLS, Production runtime/runner, 정확한 변경 시간과 실행·rollback 책임자는 아직 미확정이다.
- Production project·Secret·DNS/TLS·PR/CI·merge·release·migration·배포 변경은 0이다.
- USD 0/month 비용 확인 후 `sqcm-i-inventory-production` Seoul 생성을 1회 요청했으나 Owner/Admin 활성 Free project 2개 한도로 거부됐다. project·비용 발생은 0이며 다른 project pause/delete와 plan 변경은 하지 않았다.
- `inventory.safe-link.co.kr`, `sqcm-i-inventory-prod-01` 최소 사양, 2026-09-11 20:00~23:00 KST 변경창과 22:00 rollback cutoff, 현재 사용자 실행·rollback 책임은 승인됐다.
- 이 경로는 후속 사용자 결정으로 폐기됐다. 현재 정본은 위 무료 PostgreSQL 오버레이다.

전체 순서와 한 번에 한 Phase만 진행하는 규칙은 [`docs/roadmap.md`](./roadmap.md)에서 시각화한다. P2 릴리스 기준선·CI, P3 AI PC 연동, P4 Staging 인프라·배포와 P5 역할별 UAT는 증거 있는 완료이며, 현재 실행 Phase는 **P6 Production 전환**이다. 전용 Supabase 논리 백업은 public 복구가 원본 52 tables·40 rows·3 functions와 일치했고 회사 Google Drive의 소유자 전용 폴더에서 재다운로드 SHA-256까지 일치했다.

## 2026-08-31 P4 off-site backup·signoff 오버레이

- 회사 도메인 Google Drive 계정의 `SQCM-i Inventory/Staging Backups` 비공개 폴더를 독립 off-site 저장소로 사용했다.
- dump 471,726 bytes와 Secret 없는 manifest를 업로드했고 `shared=false`, owner-only를 확인했다.
- Drive raw readback의 bytes와 SHA-256 `74b3c163…530494`가 로컬 원본과 일치했다.
- 현재 사용자의 명시적 P4-G3 실행 요청으로 업무·보안·운영 signoff 3/3을 기록했다. Production 승인 효과는 없다.
- staging frontend/backend/database 3/3 healthy, 공개 health/readiness 200과 보호 listener PID를 재확인했다.

## 2026-08-31 P5 staging UAT preflight 오버레이

- ADMIN·MANAGER·USER application/Auth/OIDC 계정이 역할·ACTIVE·issuer·조직/부서·scope까지 각각 1:1로 일치했다.
- `P5-UAT-` fixture 충돌은 조직·부서·자산·요청 모두 0이며 합성·비식별 run ID 계약을 고정했다.
- audit request ID·IP 컬럼과 요청/행위자 인덱스 2/2를 확인했다.
- 19개 UAT는 모두 `READY_NOT_RUN`이며 실제 실행 증거 전에는 PASS로 계산하지 않는다.
- 열린 Critical/High는 사전 기준선 0이나 실제 UAT 중 한 건이라도 발견되면 Production NO-GO를 유지한다.

장기 실행 계약은 [`agent docs/prompts/79_장기_Goal_Harness_메타프롬프트.md`](../agent%20docs/prompts/79_장기_Goal_Harness_메타프롬프트.md), 기계 상태는 [`agent docs/harness/MASTER_ROADMAP.json`](../agent%20docs/harness/MASTER_ROADMAP.json)이 소유한다. 최신 격리 DB에서 application migration 25/25와 단위 148/148이 통과했다. 기존 staging Supabase는 migration 25건과 완료된 P4·P5 증거를 보존한다.

## 2026-08-31 P4 provider binding 오버레이

- 전용 Supabase private Storage, confidential OAuth client, ADMIN·MANAGER·USER 3계정과 identity link 3건을 non-seed staging에 연결했다.
- `seowon-inventory-staging`의 `frontend/backend/database` 3서비스가 healthy이며 frontend만 `127.0.0.1:3100`에 노출되고 backend·database 호스트 포트는 0이다.
- Cloudflare tunnel `994b…` connector PID 31736을 시작하고 `inventory-staging.safe-link.co.kr` DNS·TLS를 게시했다. 공개 health/readiness는 200, 인증 필요 provider route는 401이다.
- 실제 OIDC는 start 302 → authorize 302 → callback 302 → ADMIN session → logout 204를 통과했고 새 브라우저 탭에서 ADMIN dashboard와 logout을 확인했다.
- secure-cookie proxy와 consent redirect 결함을 수정했다. syntax 118, unit 140/140, UI 계약 20, active operations live preflight가 PASS했다.
- synthetic·candidate는 삭제하지 않고 각각 3개 정지 컨테이너로 보존했다. Production 변경은 없었다.

## 2026-08-21 작업 오버레이

- `codex/fix-sidebar-accessibility`에서 데스크톱 sidebar overflow, 모바일 user box, nav backdrop 클릭 경계를 수정했다.
- P1 기능 변경과 P2 로드맵·Harness·증거는 PR #22로 main에 병합됐다.
- 최신 로컬 증거는 UI 계약 16 PASS, JavaScript 구문 95 PASS, 단위 109/109 PASS, PostgreSQL 통합 20/20 PASS다.
- 관리자·매니저·사용자 메뉴와 데스크톱 로그아웃, 390px 모바일 메뉴·로그아웃을 브라우저에서 확인했다.
- P1 종료 재검증에서 UI 계약 16, 구문 95, 단위 109/109, PostgreSQL 통합 20/20이 모두 PASS했다. 1280×720 sidebar 스크롤과 로그아웃, 390×844 메뉴·사용자 영역·로그아웃 동작도 PASS했다.
- 로컬 Docker 3서비스는 healthy이며 3000·58080·55432는 localhost에만 바인딩됐다.
- LM Studio 1234/PID 6632, Ollama 11434/PID 8588, bridge/wslrelay 18765/PID 22716은 보존됐다.

## 전역지침 11단계 대조

| 게이트 | 상태 | 현재 증거 | 남은 조건 |
|---|---|---|---|
| 1 목표 | 증거 있는 완료 | 사용자·문제·가치·성공 기준이 Client/Agent Docs에 연결 | 없음 |
| 2 문서 | 증거 있는 완료 | Client/Developer/Agent/Phase 문서 분리, 본 문서가 현재 정본 | 상태 변경 시만 갱신 |
| 3 요구사항 | 증거 있는 완료 | 기업형 FR 35/35와 후속 Cost·AI 계약 추적 | 외부 운영 요구는 승인 입력 대기 |
| 4 기능 | 증거 있는 완료 | 로그인·MFA·RBAC·조직/부서 범위·자산 원장·승인·감사·Cost 기능 | 외부 AI 실연결은 HOLD |
| 5 인프라 | 증거 있는 완료 | Compose `frontend/backend/database` 정확히 3서비스, 3/3 healthy | 운영 공급자·TLS·방화벽은 외부 게이트 |
| 6 DB | 증거 있는 완료 | PostgreSQL 16.13, 필수 테이블 32, forward-only migration 22/22 | 운영 PITR/WAL·승인 migration 실행 |
| 7 화면 | 증거 있는 완료 | 실제 SPA, 페이지별 컨셉 11개, UI 계약 13, 공식 로고 HTTP 200 | 브라우저 자동조작은 localhost 정책 차단 |
| 8 개발 | 증거 있는 완료 | 구문 91개, 단위 105/105, RBAC·CSRF·트랜잭션 역조건 | 없음 |
| 9 배포 | 승인된 보류 | 로컬 build·health·smoke·rollback 계약 준비 | 검증 SHA, 외부 승인, staging/production 실행 |
| 10 통합 테스트 | 증거 있는 완료 | PostgreSQL 통합 20/20, 비기능·장애복구 PASS | 외부 공급자·실사용자 UAT는 별도 |
| 11 유지보수 | 증거 있는 완료 | health·DB 상태·migration·로그·복구 검사 자동화 | 운영 백업 저장소·경보 수신·온콜 승인 |

## 최신 검증 증거

| 검증 | 결과 |
|---|---|
| `npm.cmd run check` | JavaScript 구문 91개, 단위 105/105 PASS |
| `npm.cmd run test:integration` | 실제 PostgreSQL·HTTP 업무 흐름 20/20 PASS |
| `npm.cmd run ui:contract` | 13 PASS |
| `npm.cmd run compose:contract` | 서비스 `backend/database/frontend`, count 3 |
| Docker Compose | 세 서비스 모두 healthy |
| `npm.cmd run db:verify` | migration 22/22 일치 |
| `npm.cmd run maintenance:check` | frontend/backend 200, 필수 테이블 32 확인 |
| `npm.cmd run deploy:smoke` | health 200, readiness 200, 익명 401, 반전 로고 200 |
| `npm.cmd run test:nonfunctional` | 60요청, 오류율 0%, p95 20.6ms, 보안 경계 PASS |
| `npm.cmd run test:recovery` | DB 장애 감지 6,078ms, 복구 17ms PASS |
| `npm.cmd run repository:hygiene` | 고정 자격증명 0, Mock 제작 문구 0, PNG 제작 청크 0 |
| `npm.cmd audit --omit=dev --audit-level=high` | 취약점 0 |

## 보안·자격증명 상태

- `.env`는 Git에서 무시하며 `scripts/new-local-env.ps1`이 로컬 난수를 생성한다.
- GitHub Actions는 `scripts/write-ci-env.mjs`로 매 실행 임시 자격증명을 생성한다.
- Compose에는 비밀번호 기본값이 없으며 필수 Secret이 없으면 fail-closed한다.
- `DB_RUN_SEEDS=true`인 개발 환경만 시드 계정의 난수 비밀번호·잠금 상태를 동기화한다. production은 migration·seed를 모두 거부한다.
- 컨셉아트와 HTML Mock에는 생성 도구·프롬프트·모델 제작 메타데이터를 노출하지 않는다.

## 미완료 외부 게이트

1. 운영 결정표 8건은 검증 완료 0건이다. 운영 URL은 결정됐지만 DNS/TLS 연결은 대기다.
2. P3 Pilot UAT 체크 19항목은 19 PASS·0 FAIL·0 NOT_RUN이며 업무·보안·운영 승인은 P3 G5 범위로 3/3 승인됐다. P5 staging UAT를 대신하지 않는다.
3. 실제 operations manifest와 cutover evidence는 없고 저장소에는 계약용 template만 있다.
4. 비품관리 전용 OIDC·외부 저장소·event publisher·staging 경보·AI HTTPS route와 독립 off-site 논리 backup은 연결됐다. Free plan PITR 부재는 24시간 RPO 논리 백업으로 관리하며 Production 전 별도 운영 판정이 필요하다.
5. AI PC runtime·bridge·OCR external end-to-end G3, 사용자 로그인 운영 모드 G4, Defender·로컬 경보 G5 19/19가 PASS해 P3는 증거 있는 완료다.
6. main merge와 production 배포는 승인·증거가 충족될 때까지 실행하지 않는다.

## 다음 READY

P5는 migration 025와 staging backend 재배포 후 **19 PASS·0 FAIL·0 PENDING**, Critical/High 0, 업무·보안·운영 전자서명 3/3으로 증거 있는 완료다. 정상 PNG·EICAR 차단·MFA·승인·반납·구매·provider receipt와 USER Supabase SSO·390×844 모바일 핵심 화면·로그아웃이 통과했다.

P6-G3에서 후보 `e238ab8dab7f…`의 원격 일치, GitHub-hosted quality와 release-images 성공, AI PC loopback Production 3서비스 배포, migration 25/25, backup·restore와 실제 중지형 rollback·재기동을 통과했다. main merge·공개 전환은 실행하지 않았다.

현재 유일한 READY는 **P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF**다. 사전점검은 `READY_WAIT_CHANGE_WINDOW`이며 승인된 변경창 `2026-09-11 20:00~23:00 KST`에서 전용 Production tunnel·공개 DNS/TLS, 실제 사용자 로그인·MFA, 관측·최종 서명을 검증한다. 변경창 입력 봉투는 물리 참조 0/5·mutating 확인값 사전 무장 0개로 `READY_WAIT_CHANGE_WINDOW_INPUT_REFERENCES`다. 그 전까지 서비스는 `127.0.0.1:3300` 격리를 유지하며 Production은 `NO-GO`다. P6 actual 완료 뒤 exact HTTPS를 UTC 하루 1회 저장소 밖 원장에 축적하는 30일 SLO 수집기, exact TLS·health/readiness 관측기, P7 actual 인수 10문서 통과 뒤 Harness를 8/8 COMPLETE로 닫는 fail-closed 종단 전환기까지 로컬 준비됐다.
# Phase 74 불변 이미지 릴리스 게이트 (2026-08-15)

- GitHub Actions 외부 참조를 공식 commit SHA로 고정하고, main의 정확한 SHA로 frontend/backend 이미지를 GHCR에 발행하는 workflow를 추가했다.
- production은 `sha-<40자리 git sha>`와 서로 다른 공식 GHCR 이미지 두 개만 허용하며 외부 호스트에서 재빌드하지 않는다.
- 로컬 검증은 구문 93개, 단위 107/107, Compose 3서비스 계약, 저장소 위생, workflow YAML, PowerShell parser, diff 검사를 통과했다.
- PR CI·main 병합·GHCR digest는 원격 실행 후 증거를 갱신한다. 운영 서버·Secret·DNS/TLS·UAT 서명·AI PC G1~G5가 없어 production은 NO-GO다.

# Phase 75 외부 게이트 실행 계약 (2026-08-15)

- PR #10·#11에서 검증된 애플리케이션 릴리스 기준 SHA `c51cc7377d52b569de0c934a09e0a8479f74f702`가 `v1.0.0-rc.1` prerelease와 두 불변 GHCR 이미지에 연결됐다.
- 이슈 #15의 검토자 초대는 사용자 결정으로 제외됐다. 남은 외부 작업은 #14 AI PC → #12 staging 인프라·배포 → #13 UAT → production cutover 순서다.
- `sqcm.safe-link.co.kr`은 기존 SQCM-i OS 응답이므로 비품관리 앱의 운영 health 증거가 아니다. 전용 hostname 또는 충돌 없는 route가 필요하다.
- 외부 입력이 없는 상태에서 계정·서버·Secret·서명을 추정하지 않으며 production은 승인된 보류다.

# Phase 77 migration checksum 플랫폼 정합성 (2026-08-17)

- Windows CRLF와 Linux LF가 동일 SQL에 동일한 migration checksum을 만들도록 정규화하고, 기존 CRLF checksum 호환과 실제 SQL 변경 감지를 함께 검증했다.
- 최신 검증은 JavaScript 구문 95개, 단위 109/109, migration 22/22, PostgreSQL·HTTP 통합 20/20, UI 계약 13, Docker 3서비스 계약, 유지보수·저장소 위생 PASS다.
- PR #17을 main SHA `a5abc374109438f7ee8c9e5683839ed568d13de8`로 병합했고 main quality와 frontend/backend 불변 이미지 발행이 PASS했다.
- 운영 DB·production 배포는 수행하지 않았고 기존 외부 게이트의 NO-GO는 유지한다.
