# 서원토건 비품관리 시스템 최신 단일 현황

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
- `ACC-P7-01`을 완료했다. `operations:handover-preflight`는 SLO·경보·백업·복원·인증서·온콜·정기점검·개선 큐 8개 영역을 fail-closed 검사한다. 계약 오류 0, focused 4/4, 저장소 구문 171개와 단위 200/200이 PASS했다. 실제 증거 참조 12개와 P6 완료가 없어 `READY_WAIT_P6_COMPLETION_AND_HANDOVER_INPUTS`이며 P7은 미착수다.
- `ACC-P7-02`의 실제 증거 finalizer 준비를 완료했다. `operations:handover-finalizer`는 P6 actual cutover, 운영 8영역 PASS, Production provenance와 운영 책임자 identity 서명을 모두 요구하고 template·staging·loopback·baseline 증거를 거부한다. 현재는 `READY_WAIT_P6_COMPLETION_AND_HANDOVER_EVIDENCE`이며 실제 활성화는 `NOT_RUN`이다.
- `ACC-P7-03`을 완료해 finalizer의 문자열 참조 fail-open을 제거했다. 이제 P6 cutover·운영 8영역·운영 서명 총 10개 실제 JSON은 path와 SHA-256이 일치해야 하며 SLO·경보 5종 receipt·off-site backup·격리 restore·TLS·온콜·maintenance·개선 큐 측정값까지 통과해야 한다. 문자열-only·누락·해시 변조·staging 증거는 차단되며 focused 5/5, 저장소 250/250이 PASS했다.
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
- 저장소 표준 검증에서 JavaScript 구문 191개와 단위 250/250이 PASS했으며 active branch provenance, preflight·UAT actor transaction provision·exact ingress publication·공개 probe·로그·loopback 및 변경창 공개 역할 MFA/RBAC·인증 CSRF/idempotency·nonfunctional·operational health runner·rollback readiness·정확한 Cloudflare route disable·최종 서명 Gate·증거 조립·실제 cutover 전체 계약 finalizer·P7 운영 인수 10문서 SHA bundle finalizer 회귀가 검증 봉투에 포함된다.

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

현재 유일한 READY는 **P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF**다. 사전점검은 `READY_WAIT_CHANGE_WINDOW`이며 승인된 변경창 `2026-09-11 20:00~23:00 KST`에서 전용 Production tunnel·공개 DNS/TLS, 실제 사용자 로그인·MFA, 관측·최종 서명을 검증한다. 그 전까지 서비스는 `127.0.0.1:3300` 격리를 유지하며 Production은 `NO-GO`다.
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
