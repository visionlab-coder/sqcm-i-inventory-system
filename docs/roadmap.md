# SQCM-i 비품관리 시스템 전체 로드맵

<!-- HARNESS_STATUS_START -->
Harness 진행: **7 / 8 Phase 완료**
현재 Phase: **P7**
현재 READY: `P7-G1-OPERATIONS-ACTIVATION-AND-SIGNOFF`
Production GO: **true**
<!-- HARNESS_STATUS_END -->

기준일: 2026-09-04

상태 정본: [`docs/current-state.md`](./current-state.md)

장기 실행 상태: [`agent docs/harness/MASTER_ROADMAP.json`](../agent%20docs/harness/MASTER_ROADMAP.json)

로드맵 역할: 전체 진행 순서와 현재 실행 Phase를 한 화면에 고정한다. 과거 `docs/phase-reports/`의 Phase 번호는 역사 증거이며, 새로운 실행 순서를 결정하지 않는다.

제품 인도 체크포인트: **최신 `qs 6.16.0` 포함 Production 제품 11/11 완료**. 원격 main·배포 release는 `93aa5b8fde5a6ac29758afb91acbef278bdfae49`이며 P7은 기능 개발이 아닌 운영 자격 증거 축적 단계다.

## SQCM-i C 제품 고도화 트랙

현재 Production 기준선과 P7 운영 증거는 보존하면서, Excel 업무를 건설 자산 통제 제품으로 전환하는 별도 제품 Epic을 순차 진행한다.

`C1 Excel 이관 ✅ → C2 QR·라벨 ✅ → C3 오프라인 재물조사 ✅ → C4 직원 셀프서비스 ✅ → C5 HR·ERP 연동 G0~G2 ✅ / G3 READY → C6 선택형 IoT 🔒`

- 현재 제품 READY: `PE-C5-G3-ERP-EAPPROVAL-DELIVERY`
- C1 구현 증거: 메타프롬프트 8/8, UI 계약 30/30, 구문 436개, 단위 927 PASS·8 SKIP·0 FAIL.
- C1 실제 증거: 격리 PostgreSQL HTTP 통합 1 PASS·0 FAIL, frontend/backend/database 3컨테이너 health·smoke PASS, Chrome 1440×900·390×844 렌더·무가로넘침 PASS.
- 판정: C5 G2는 provider·organization 범위의 조직·부서·직원 명시 매핑, 원자적 이동·퇴사 처리와 예외 큐를 구현했다. 전체 단위 954 PASS·8 SKIP, 구문 458개, 로컬 migration 29/29와 합성 이동 APPLIED·자산 보유 퇴사 fail-closed·cleanup 0이 PASS했다. WIP 복구 체크포인트 `6651ae0d540dc60a4b718104b49f9d7578921226`을 push했다. C5 전체는 진행 중이며 Production·staging·외부 공급자는 변경하지 않았다.
- 상세 정본: [`develop docs/34_SQCM-i_C_제품고도화_로드맵.md`](../develop%20docs/34_SQCM-i_C_%EC%A0%9C%ED%92%88%EA%B3%A0%EB%8F%84%ED%99%94_%EB%A1%9C%EB%93%9C%EB%A7%B5.md)

## 1. 운영 규칙

1. 한 번에 `진행 중` Phase는 정확히 1개만 둔다.
2. 현재 Phase의 완료 조건과 증거가 모두 충족되기 전에는 다음 Phase를 시작하지 않는다.
3. Phase를 닫을 때 이 문서의 상태·증거·현재 위치를 함께 갱신한다.
4. `승인된 보류`는 실패가 아니라 외부 입력 또는 사용자 승인을 기다리는 상태다.
5. commit·push·배포·운영 변경·Secret·UAT 서명은 별도 승인과 실제 증거 없이는 완료로 바꾸지 않는다.
6. 사용자가 `다음 진행`을 요청하면 아래의 `현재 Phase` 한 건만 수행한다.

상태 표기: `✅ 증거 있는 완료` · `🔄 진행 중` · `⏳ 미착수` · `🔒 승인된 보류` · `⛔ 차단`

## 2. 전체 진행 시각화

```mermaid
flowchart LR
    P0["P0 로컬 제품 기준선<br/>✅ 완료"] --> P1["P1 UI 접근성 안정화<br/>✅ 완료"]
    P1 --> P2["P2 릴리스 기준선·CI<br/>✅ 완료"]
    P2 -->|"main SHA·CI·이미지 digest"| P3["P3 AI PC 연동<br/>✅ 완료"]
    P3 --> P4["P4 Staging 인프라·배포<br/>✅ 완료"]
    P4 --> P5["P5 역할별 UAT<br/>✅ 19/19·서명 3/3"]
    P5 --> P6["P6 Production 전환<br/>✅ actual cutover 완료"]
    P6 --> P7["P7 운영·유지보수 활성화<br/>🔄 G1 실제 증거 수집·인수"]

    classDef done fill:#DCFCE7,stroke:#15803D,color:#14532D,stroke-width:2px;
    classDef active fill:#DBEAFE,stroke:#1D4ED8,color:#1E3A8A,stroke-width:4px;
    classDef pending fill:#F3F4F6,stroke:#6B7280,color:#374151,stroke-width:2px;
    classDef hold fill:#FEF3C7,stroke:#B45309,color:#78350F,stroke-width:2px;
    classDef blocked fill:#FEE2E2,stroke:#B91C1C,color:#7F1D1D,stroke-width:4px;
    class P0,P1,P2,P3,P4,P5 done;
    class P6 done;
    class P7 active;
```

진척도: **7 / 8 Phase 완료**

현재 위치: **P7 운영·유지보수 활성화**

다음 Gate: **P7-G1-OPERATIONS-ACTIVATION-AND-SIGNOFF**

## 3. 실행 Phase 판정표

| Phase | 범위 | 상태 | 완료 조건 | 현재 증거 또는 차단 입력 |
|---|---|---|---|---|
| P0 로컬 제품 기준선 | 저장소 확보, Wi-Fi 대체 게이트, 로컬 Docker 3계층, DB·API·UI 기본 검증 | ✅ 증거 있는 완료 | 로컬 서비스 healthy, 필수 테스트 PASS, 보호 서비스 보존 | Wi-Fi 사용 가능, Docker 3/3 healthy, 구문 95, 단위 109/109, 통합 20/20 |
| P1 UI 접근성 안정화 | 데스크톱·모바일 메뉴, 로그아웃 접근성, 클릭 차단 회귀 수정 | ✅ 증거 있는 완료 | 변경 diff 검토, UI 계약 16 PASS, 역할별 브라우저 확인, 변경 기준선 확정 승인 | UI 계약 16, 구문 95, 단위 109/109, 통합 20/20 PASS. 1280×720 및 390×844 로그아웃 동작 확인 |
| P2 릴리스 기준선·CI | P1·Harness 변경 commit, PR, 원격 CI, 불변 이미지 기준선 | ✅ 증거 있는 완료 | 승인된 commit/push/PR, CI PASS, main 병합 후 정확한 SHA·이미지 digest 기록 | main `79a1292…`, PR #22, main quality·release-images PASS, backend/frontend digest 기록 |
| P3 AI PC 연동 | 독립 bridge/runtime/model, G1~G5, fallback | ✅ 증거 있는 완료 | checksum, listener, TLS·인증, health/ready, 계약·rollback PASS | G0~G5, Pilot UAT 19/19, 승인 3/3, Defender·경보 receipt PASS |
| P4 Staging 인프라·배포 | 전용 hostname, 공급자, Secret reference, backup, staging 배포 | ✅ 증거 있는 완료 | backup→migration→불변 이미지→health/smoke→rollback PASS | non-seed·DNS/TLS·provider·OIDC·backup/migration·rollback·off-site readback·signoff 3/3 PASS |
| P5 역할별 UAT | 19개 UAT와 업무·보안·운영 책임자 검수 | ✅ 증거 있는 완료 | staging 19개 PASS, Critical/High 0, 책임자 실제 서명 | 기술 UAT 19/19·Critical/High 0·업무/보안/운영 전자서명 3/3 |
| P6 Production 전환 | 최종 승인, cutover, 관측·복구 확인 | ✅ 증거 있는 완료 | P3~P5 PASS, 승인된 변경 시간, cutover·rollback 증거 | release `d91d9c3…`, actual run `c0901830…`, 12/12 Gate, 역할 UAT 3/3, MFA 결박 업무·보안·운영 서명 3/3, actual evidence SHA `2cbae48f…`, 공개 Cloudflare DNS/TLS와 `productionGo=true` |
| P7 운영·유지보수 활성화 | 백업, 경보, 온콜, 정기 점검, 개선 큐 | 🔄 진행 중 | 운영 백업·경보 수신·복구훈련과 책임자 인수 | G0 계약 오류 0 PASS. 실제 HTTPS SLO 1/30일, TLS 인증서 PASS, 일일점검 6종 PASS. SLO 29일·외부 경보 5종·off-site backup/restore·온콜 ACK·GitHub triage·최종 MFA 인수는 진행 중 |

## 4. 전역지침 11단계 연결

| 전역 단계 | 현재 판정 | 실행 Phase 연결 |
|---|---|---|
| 1 목표 | ✅ 증거 있는 완료 | P0 |
| 2 문서 | ✅ 증거 있는 완료 | P0 및 이 로드맵 |
| 3 요구사항 | ✅ 증거 있는 완료 | P0 |
| 4 기능 | ✅ 증거 있는 완료 | P0 |
| 5 인프라 | ✅ 증거 있는 완료 | P0, P4, P6 |
| 6 DB | ✅ 증거 있는 완료 | P0, P4, P6 |
| 7 화면 | ✅ 증거 있는 완료 | P1 |
| 8 개발 | 기준선·릴리스 기준선 ✅ | P2 |
| 9 배포 | ✅ Production GO | P2, P4, P6 |
| 10 통합 테스트 | ✅ 역할별 UAT·Production 검증 완료 | P0, P5, P6 |
| 11 유지보수 | ✅ 제품 인계 준비 / P7 장기 운영자격 진행 중 | P7 |

## 5. 현재 Phase 카드 — P7

- 목표: Production 운영 8영역의 actual 증거와 운영 책임자 MFA 인수를 연결해 `8 / 8 Phase 완료`를 증명한다.
- 사전 증거: P6 actual run `c0901830-e0f4-45ac-b0c7-6eddf6318480`, 12/12 Gate, 역할 UAT 3/3, MFA 결박 서명 3/3, release `d91d9c3…`, `productionGo=true`.
- 현재 증거: HTTPS SLO 1/30 UTC 날짜, TLS 인증서 PASS, 일일 유지보수 6종 PASS, GitHub public operations queue read HTTP 200·0건·Secret read 0.
- 남은 Gate: SLO 29일, 외부 경보 5종 receipt, off-site backup·격리 restore, PRIMARY·ESCALATION ACK, GitHub triage attestation/export, 최종 운영 책임자 MFA 서명.
- 비범위: 시간·receipt·책임자·외부 저장소·서명 증거의 임의 생성, 승인 범위 밖 Secret·메시지·데이터 전송·계정 변경.

### P6 완료 전 준비 기록
- 현재 상태: 후보 `e238ab8dab7f…`의 불변 이미지, AI PC PostgreSQL 16 loopback Production 3서비스, migration 25/25, backup·restore·rollback·재기동과 공급자 5종 읽기 전용 preflight가 PASS했다. Harness 기계 정본 branch는 실제 `codex/p6-ai-pc-postgres-production`과 일치하며 local·GitHub Actions branch provenance 불일치를 fail-closed 한다. cutover preflight의 Git·Docker·PowerShell·Cloudflare 조회는 각 10초 상한이고 tunnel 관측 실패는 기존 tunnel 보존을 추정하지 않고 local blocker로 닫힌다. ingress publication도 CLI·PowerShell·API·DNS에 5~10초 상한을 적용하며 초기 DNS 관측 실패는 외부 변경 전에 중단한다. 공개 DNS·TLS·외부 health/readiness, logs/5xx·outbox, 역할별 core smoke, nonfunctional, operational health, CSRF/idempotency, rollback readiness와 최종 서명 preflight가 준비됐다. 12개 Gate 각각의 실패 매트릭스는 12/12에서 실패 지점 이후 실행을 중단하고 public route-disable 확인으로 격리하며 미확인 rollback을 차단했다. 변경창 실행 상태 머신은 window·confirmation·handler 계약을 선검사하고 cutoff·첫 실패·예외에서 이후 Gate를 중단하며 route-disable evidence 없이는 containment를 금지한다. 14-step adapter는 exact runner 인자·PASS 상태·evidence reference를 강제해 exit 0의 대기 결과 승격을 막는다. P7 운영 활성화 19단계는 정상·WAIT 재개 물리 receipt 흐름과 함께 각 단계 동일 실패 3회 격리 매트릭스 19/19, 이후 단계 receipt 0건을 합성 검증했다. 승인된 세 역할을 MFA·scope·session revoke·audit와 함께 transaction provision하는 실행기와 exact Cloudflare tunnel·runtime config·proxied CNAME publication, 실패 시 exact route-disable 실행기도 준비됐지만 실제 계정/API/DNS/process 변경은 `NOT_RUN`이다. 역할 preflight는 ADMIN·MANAGER·USER active/MFA 0명과 credential reference 0/3을 명시하고, 서명 preflight는 역할별 결과·업무·보안·운영 참조 0/6을 명시해 외부 입력을 기다린다. cutover 증거는 12개 Gate 중 로컬 4건 PASS·외부 8건 PENDING이다. P6-G4는 `READY_WAIT_CHANGE_WINDOW`이며 Production hostname은 NXDOMAIN, 전용 tunnel과 실제 사용자는 0이다. 기존 staging·tunnel·보호 서비스는 보존됐고 `productionGo=false`다.
- rollback 격리 보완: `production:route-disable`의 Cloudflare tunnel CLI·API·DNS 관측도 5~10초 상한과 1MiB 출력 상한을 적용한다. 초기 tunnel 관측 실패는 token read·DNS API 전에 중단하고 삭제 뒤 확인 실패는 외부 변경 가능성을 보수적으로 기록한다. 실제 route 삭제는 `NOT_RUN`이다.
- 공개 검증 보완: `production:public-probe`의 DNS 관측은 5초, exact HTTPS 5경로는 각각 10초 상한으로 동시에 실행한다. DNS 관측 실패는 HTTP 호출 0건으로 중단하며 실제 공개 HTTPS 검증은 DNS/TLS 게시 전까지 `NOT_RUN`이다.
- 역할 core smoke 보완: `production:role-core-smoke`의 HTTP 요청은 각각 10초 상한이며 timeout·network·JSON 오류는 credential·응답 원문 없이 fail-closed한다. MFA 뒤 중간 실패는 활성 시험 세션 logout cleanup을 시도한다. 실제 세 역할 로그인·MFA·RBAC는 credential 참조와 변경창 전까지 `NOT_RUN`이다.
- 인증 쓰기 보완: `production:authenticated-idempotency`의 HTTP·Docker 조회·SQL은 각각 10초, process 출력은 1MiB 상한이다. 실패 원문을 기록하지 않고 합성 자산·idempotency DB cleanup과 logout을 독립적으로 시도한다. 실제 인증 쓰기·replay·conflict 검증은 ADMIN credential 참조와 변경창 전까지 `NOT_RUN`이다.
- 시험계정 provisioning 보완: `production:uat-actor-provision`의 Docker 관측·copy·cleanup은 10초, transaction worker는 60초, 출력은 1MiB 상한이다. 임시 worker 삭제 확인 전에는 성공을 출력하지 않으며 실제 계정·MFA·scope·audit 변경은 승인 파일과 세 credential 참조 및 변경창 전까지 `NOT_RUN`이다.
- 역할 준비상태 조회 보완: `production:role-preflight`의 database container·role/MFA SQL 조회는 각각 10초·1MiB 상한이다. malformed·duplicate·unknown role 결과와 timeout·process 실패는 원문 없이 fail-closed하며 실제 조회는 세 역할 active·MFA 0명과 credential 참조 0/3을 확인했다.
- 운영 공급자 조회 보완: `production:provider-preflight`의 backend container 조회는 10초, 5종 provider probe는 최대 150초, 출력은 1MiB 상한이다. process·container·observation 오류 원문은 기록하지 않으며 실제 읽기 probe에서 PostgreSQL storage·Defender bridge·AI health/readiness·loopback event publisher가 PASS했다.
- CSRF/idempotency baseline 보완: `production:csrf-idempotency-baseline`의 negative login HTTP·Docker·SQL은 각각 10초, process 출력은 1MiB 상한이다. count·5열 schema 결과는 엄격 파싱하며 실제 baseline은 403 `CSRF_INVALID`, 세션 불변, schema 10/10·unique index 1·stuck/invalid 0을 확인했다. 실제 인증 replay는 변경창 전까지 `NOT_RUN`이다.
- ingress DNS 반복 실패 대체 경로: native A·CNAME 관측이 timeout·실패할 때만 Cloudflare 공개 DoH A·CNAME authoritative 응답을 사용한다. 두 경로 실패와 published/NXDOMAIN 충돌은 fail-closed하며 DNS/TLS 게시나 provider 변경은 수행하지 않는다.
- Production log Gate 보완: Docker container·backend log·outbox SQL 조회는 10초, process 출력은 일반 1MiB·로그 4MiB 상한이다. malformed JSON과 정확히 두 개 비음수 정수가 아닌 outbox 결과는 원문 없이 fail-closed하며 변경창 전 실제 기준선은 5xx·fatal·error·outbox retry/dead-letter 0건이다.
- Production nonfunctional Gate 보완: child process는 120초·1MiB 상한과 최소 환경 allowlist를 사용하고 raw stderr를 승격하지 않는다. exact target·60요청·오류율 0·p95·보안 헤더·401/403 결과를 엄격 검증하며 모든 HTTP는 10초 상한이다. 실제 loopback 기준선은 오류 0·p95 13ms·보안 계약 PASS다.
- Production operational health Gate 보완: Docker container·SQL·backend log 조회는 10초, 일반 출력 1MiB·로그 4MiB 상한이다. container·counter·JSON log를 엄격 파싱하고 physical backup을 actual bytes·streaming SHA-256으로 검증한다. 실제 loopback은 health/readiness 200, counter·5xx 0, 238,533-byte backup checksum·restore PASS다.
- Production rollback readiness Gate 보완: Docker `ps`·`inspect`·`volume ls` 조회는 10초·1MiB 상한이다. 단일 container ID·inspect identity·불변 revision·image와 중복 없는 volume 이름을 엄격 파싱하고 timeout·process·malformed 결과를 원문 없이 fail-closed한다. 실제 loopback은 revision 2/2·named volume 2/2·drill·backup/restore·cutoff·route-removal 계약 PASS다.
- Production UAT/signoff reference Gate 보완: 역할 결과 3건과 업무·보안·운영 서명 3건은 저장소 밖 절대경로의 고유 physical JSON regular file만 허용한다. 저장소 내부·상대경로·symlink/reparse·디렉터리·빈 파일·1MiB 초과·physical 중복은 준비 완료로 승격하지 않으며 현재 실제 reference는 0/6이다.
- Production actual evidence 최종 입력 보완: finalizer와 P6→P7 promotion은 동일한 저장소 밖 absolute physical JSON object reader를 사용한다. 1 byte~4MiB·real path·actual bytes·SHA-256을 검증하고 저장소 내부·symlink/reparse·parent redirect·malformed/array 입력을 fail-closed한다. 실제 evidence 미생성 상태는 WAIT이며 상태 변경은 0건이다.
- `ACC-P6-38`에서 P6 actual cutover finalizer의 actual bytes read 뒤 repository·candidate physical identity·realpath·size 재검증과 fatal UTF-8를 추가했다. read 중 같은 크기 교체·크기 변경·repository redirect·invalid encoding은 P6 완료나 P7 승격 증거가 될 수 없다.
- `ACC-P6-39`에서 P6 actual evidence assembler의 receipt·역할 결과·서명 입력을 파일당 1MiB, receipt 64개·합계 16MiB 이하의 atomic snapshot으로 통합했다. repository·receipt root·candidate를 read 전후 재검증하고 fatal UTF-8 JSON object만 사용해 교체·redirect·과대 입력을 actual 증거로 조립하지 않는다.
- `ACC-P6-40`에서 Gate 12 signoff resume checkpoint를 최대 1MiB fatal UTF-8 JSON object atomic reader로 전환하고 Gate 1~11 receipt 검증을 ACC-P6-39 공용 bounded snapshot loader에 결합했다. repository·receipt root·candidate identity·realpath·size가 read 중 변하면 같은 run Gate 12 재개를 fail-closed한다.
- `ACC-P6-41`에서 Production UAT 승인·ADMIN·MANAGER·USER credential JSON을 저장소 밖 physical `.json` 전용 64KiB bounded atomic reader로 통합했다. read 전후 repository/file identity·realpath·size와 fatal UTF-8·JSON object를 강제해 symlink/reparse·redirect·교체·과대·invalid encoding을 actual UAT 입력으로 승격하지 않는다. 만료된 24시간 backup health는 새 백업·격리 복구 드릴로 갱신하고 제한은 완화하지 않았다.
- `ACC-P6-42`에서 Production Cloudflare DNS rollback token의 dry-run presence inspection과 actual read를 분리했다. presence inspection은 Secret content를 읽지 않고, actual ingress publication·route-disable 실행은 저장소 밖 physical Secret 전용 64KiB bounded atomic reader로 repository/file identity·realpath·size와 fatal UTF-8를 read 전후 재검증한다. 실제 token read·DNS/tunnel/route 변경은 수행하지 않았다.
- 다음 READY: **P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF**. 승인된 `2026-09-03 10:00~13:00 KST` 변경창에서 공개 DNS/TLS, 실제 사용자 로그인·MFA, 관측과 업무·보안·운영 최종 서명을 검증한다.
- `ACC-P6-95` 변경창 계약 정합화: 활성 실행기·시험·Harness를 KST `10:00~13:00`, cutoff `12:00`와 UTC `01:00Z~04:00Z`, cutoff `03:00Z`로 통일했다. 검증은 unit 885 PASS·8 SKIP·0 FAIL, Harness verify PASS이며 외부 변경은 아직 `NOT_RUN`이다.
- 가속 Packet: **ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF**. P6 cutover finalizer는 정확히 12개 고유 Gate·세 역할 UAT·3개 승인·불변 SHA·정확한 URL을 강제한다. P7 finalizer는 P6 cutover·운영 8영역·운영 서명 10개 실제 JSON의 path·SHA-256과 영역별 측정값을 검증하고, assembler는 P6 완료·P7 활성화 뒤 저장소 밖 manifest를 선검증·원자적 1회 쓰기로 조립한다. SLO compiler는 exact Production URL의 30일 측정 원본에서 가용성·p95를 직접 계산한다. Alert delivery runner는 승인된 공개 HTTPS 공급자에 5종 경보를 deterministic idempotency로 전송해 실제 DELIVERED receipt를 만들고 alerting compiler가 고유 receipt를 재검증한다. Backup/restore compiler는 24시간 RPO·30일 off-site retention·checksum과 4시간 RTO·격리 복원·count/migration 일치를 검증한다. Certificate compiler는 최근 TLS 관측의 exact hostname·chain·fingerprint·유효기간·30일 갱신 lead와 health/readiness를 검증한다. On-call drill runner는 승인된 Asia/Seoul 30일 당번표의 서로 다른 수락 책임자에게 primary→escalation 시험을 멱등하게 보내 5분·15분 고유 ACK receipt를 만들고 onCall compiler가 최근 7일 drill과 provenance를 재검증한다. Maintenance compiler는 불변 release의 최근 일일 점검 6종과 24시간 다음 일정·고유 receipt를 검증한다. ImprovementQueue는 read-only GitHub collector가 승인된 triage attestation과 고정 label·단일 bounded metadata로 actual export를 만들고 compiler가 최근 triage·책임자·수용조건·후속기한·미추적 finding 0건을 재검증한다. Operations signoff compiler는 P6 SHA와 8영역 고유 PASS SHA, OPERATIONS_OWNER identity·최근 receipt·운영 업무 6종 수락·차단 예외 0건을 검증하며 실제 서명은 만들지 않는다. 운영 활성화 오케스트레이터는 19개 child별 환경 allowlist를 강제해 상위 프로세스의 unrelated Secret·GitHub token·`NODE_OPTIONS` 상속을 차단하고, 승인 manifest에 source·entrypoint·19개 child와 재귀 로컬 정적 의존성 graph의 exact bundle SHA-256을 결합한다. 실제 child timeout·출력 한도·spawn 오류·signal 종료는 오류 원문 없이 제한된 실패 상태로 정규화한다. 동일 timeout·출력 한도 실패가 연속 2회면 세 번째 시도에만 각각 4시간·4MiB bounded 대체 프로필을 적용하고 receipt 프로필을 이전 실패 체인으로 재검증하며, 혼합·spawn·signal 실패에는 자원·권한을 확대하지 않는다. 별도 OPERATIONS_OWNER MFA approval receipt SHA와 P6 cutover·OPERATIONS 서명 SHA까지 동일 identity·run·release·bundle·19단계·10행위로 연결해 단일 JSON 자기승인을 차단한다. unsigned approval request assembler는 P6 actual 증거와 현재 bundle digest에서 이 승인 항목을 exact payload로 조립하고, manifest assembler는 외부 MFA receipt와 request·P6·현재 bundle을 교차검증해 receipt signedAt부터 최대 45일인 실행 manifest를 만든다. 읽기 전용 approval-chain preflight는 P6·request·receipt·manifest·현재 bundle 전체를 activation 전에 다시 검증한다. 합성 approval pipeline은 물리 JSON 4개와 변조 3건을 검증하고, approval-to-orchestrator 리허설은 이를 receipt-root claim·첫 `slo-collect` PASS receipt·다음 `slo-compile` 선택까지 연결한다. 전체 sequence 리허설은 동일 approval SHA 아래 19개 물리 receipt를 끝까지 기록하고, WAIT/재개 및 3회 실패 격리 리허설은 각각 동일 단계 재개와 19/19 정지를 검증한다. process runner 리허설은 실제 진입점의 child 환경·마지막 JSON 판정·redacted receipt 연결을 합성 child 19건으로 sequence complete까지 검증한다. 여섯 리허설 모두 실제 승인·child·activation·Production GO로 승격하지 않는다. 기존 10문서 운영 증거 합성 리허설도 compiler·assembler·finalizer 호환 및 SHA 변조 차단을 검증하고 결과를 즉시 폐기한다. 실제 활성화는 P6 G4 완료와 운영 증거 이후에만 허용하며 P7 상태는 미착수로 유지한다.
- `ACC-P7-16`에서 P7 handover finalizer·assembler·8/8 completion의 실제 manifest와 10개 하위 문서를 동일한 external physical JSON bounded reader로 통합했다. 각 파일은 최대 4MiB이며 저장소 내부·상대 탈출·symlink/reparse·parent redirect·malformed/array 입력은 완료 증거가 될 수 없다.
- `ACC-P7-42`에서 P7 activation approval request·manifest·read-only preflight·orchestrator와 재개 receipt를 동일한 external physical JSON bounded reader로 통합했다. 각 파일은 최대 4MiB이며 저장소 내부·symlink/reparse·parent redirect·malformed/array 입력은 승인 또는 실행 증거가 될 수 없다.
- `ACC-P7-43`에서 operations signoff assembler의 P6 actual cutover·운영 8영역·OPERATIONS_OWNER approval receipt 10개 입력을 동일한 external physical JSON bounded reader로 통합했다. 각 파일은 최대 4MiB이며 실제 bytes·SHA-256만 조립 provenance가 될 수 있다.
- `ACC-P7-44`에서 P7 운영 8영역 evidence compiler의 actual 입력을 동일한 external physical JSON bounded reader로 통합했다. 각 파일은 최대 4MiB이며 실제 bytes·SHA-256만 영역별 source provenance가 될 수 있다.
- `ACC-P7-45`에서 alert delivery·backup/restore·on-call drill·improvement queue runner의 provider manifest·approval attestation 4개 제어 JSON을 동일한 external physical JSON bounded reader로 통합했다. Credential은 별도 Secret 경계로 유지한다.
- `ACC-P7-46`에서 alert delivery·on-call drill·improvement queue runner의 credential 파일 3건을 external physical UTF-8 전용 64KiB bounded Secret reader로 통합했다. Secret 원문은 증거·로그·오류에 기록하지 않는다.
- `ACC-P7-47`에서 SLO JSONL ledger를 external physical UTF-8 전용 64KiB bounded reader로 통합했다. P6 actual cutover 전에는 ledger content를 읽지 않고 append와 30일 export 재읽기도 같은 경계를 사용한다.
- `ACC-P7-48`에서 P7 maintenance와 P6 operational-health의 Docker process·backup 입력 경계를 통합했다. process는 10초·기본 1MiB·로그 4MiB, exact Production physical manifest는 64KiB fatal UTF-8 JSON object, dump는 bytes·streaming SHA-256을 강제한다.
- `ACC-P7-49`에서 P7 backup/restore의 모든 Docker child에 작업별 10초~60분 timeout, stderr 64KiB·capture 4MiB 상한, shell 금지와 timeout·출력·stream 실패 child 종료를 적용했다. dump/restore는 streaming하며 실패 원문을 증거에 남기지 않는다.
- `ACC-P7-50`에서 P7 improvement queue GitHub page response에 15초·declared/actual 1MiB 상한, oversize reader 취소, fatal UTF-8·JSON array-only 계약을 적용하고 무제한 `response.json()` buffering을 제거했다.
- `ACC-P7-51`에서 Operations provider preflight의 OIDC discovery와 AI health/readiness GET response에 10초·declared/actual 1MiB 상한, oversize reader 취소, fatal UTF-8·JSON object-only 계약을 적용하고 무제한 `arrayBuffer()`·`json()` buffering을 제거했다.
- `ACC-P7-52`에서 Operations provider preflight manifest 입력을 `.json` physical file·realpath 일치·1 byte~1MiB·read 전후 안정성·fatal UTF-8·JSON object-only 계약으로 교체하고 직접 무제한 `readFileSync(..., 'utf8')`를 제거했다.
- `ACC-P7-53`에서 Operations activation receipt-root claim과 single-writer lease 상태 재읽기를 exact receipt root·basename의 physical file·realpath 일치·1 byte~64KiB·read 전후 directory/file identity·actual bytes·fatal UTF-8·JSON object-only 계약으로 교체했다. 과대·symlink/reparse·redirect·malformed 상태는 root 재사용이나 lease 삭제 권한이 될 수 없다.
- `ACC-P7-54`에서 Operations activation bundle dependency graph와 digest를 각 physical file을 정확히 한 번 읽는 동일 bounded snapshot으로 통합했다. 파일당 4MiB·전체 64MiB, exact root/file realpath, read 전후 identity·size·actual bytes, fatal UTF-8 계약으로 중간 교체·과대 입력과 graph/hash 관측 분리를 차단한다.
- `ACC-P7-55`에서 activation approval request·manifest·preflight·orchestrator의 Phase 권한 입력인 `MASTER_ROADMAP.json` direct unbounded read를 공용 bounded control reader로 교체했다. exact repository physical file·1 byte~1MiB·read 전후 root/file identity/realpath/size·actual bytes·fatal UTF-8·JSON object 계약으로 외부 redirect·과대·교체 입력이 activation 권한이 되는 것을 차단한다.
- `ACC-P7-56`에서 P7 activation approval·receipt·control·Secret 공용 external input reader를 atomic snapshot으로 강화했다. actual bytes read 뒤 repository/candidate physical identity·realpath·size를 재검증하고 JSON을 fatal UTF-8로 decode해 read 중 동일 크기 교체·크기 변경·root redirect·invalid encoding을 차단한다.
- `ACC-P7-57`에서 P7 handover finalizer의 최상위 manifest와 10개 실제 운영 증거 JSON을 atomic snapshot으로 강화했다. actual bytes read 뒤 repository·external base·candidate physical identity·realpath·size를 재검증하고 fatal UTF-8로 decode해 read 중 동일 크기 교체·크기 변경·root/base redirect·invalid encoding을 차단한다.
- `ACC-P7-58`에서 P7 실제 운영 활성화의 SLO·경보·backup/restore·certificate·on-call·maintenance·improvement queue·operations signoff·handover runner/compiler 18개를 ACC-P7-55의 공용 atomic `MASTER_ROADMAP.json` control reader에 결합했다. activation approval 경로와 실제 운영 증거 생성 경로가 exact repository physical file·1MiB·read-after identity/realpath/size·fatal UTF-8·JSON object 계약을 공유한다.
- `ACC-P7-59`에서 P6 완료 직후 실행될 P7 handover preflight candidate를 physical JSON·1MiB·read-after 안정성·fatal UTF-8 전용 reader에, `MASTER_ROADMAP.json`을 exact repository atomic control reader에 결합했다. handover 권한 판정의 direct unbounded JSON read를 제거했으며 실제 P6 cutover와 P7 handover는 `NOT_RUN`이다.
- `ACC-P7-60`에서 handover candidate와 `MASTER_ROADMAP.json`을 각각 한 번 읽은 동일 pair snapshot으로 통합했다. 두 파일 전체의 read 전후 root/file identity·realpath·size를 재검증해 서로 다른 시점의 candidate·roadmap 조합을 차단했으며 실제 P6 cutover와 P7 handover는 `NOT_RUN`이다.
- `ACC-P7-61`에서 8/8 terminal completion의 `MASTER_ROADMAP.json`과 가속 큐를 각각 한 번 읽은 동일 pair snapshot으로 통합했다. 두 기계 정본 전체의 read 전후 root/file identity·realpath·size를 재검증해 서로 다른 시점의 Phase·READY 상태 조합을 차단했으며 실제 terminal completion은 `NOT_RUN`이다.
- `ACC-P6-43`에서 P6→P7 promotion도 ACC-P7-61의 동일 atomic roadmap·가속 큐 pair reader에 결합했다. actual cutover 뒤 P7 승격과 actual handover 뒤 8/8 완료가 같은 cross-file TOCTOU 차단 계약을 공유하며 실제 Phase 전환은 `NOT_RUN`이다.
- `ACC-P6-44`에서 P6 G4의 cutover 실행·actual evidence 조립·role result·signoff·candidate 검사 5개 진입점을 physical JSON·1MiB·realpath·read-after 안정성·fatal UTF-8·object-only 공용 bounded reader에 결합했다. direct unbounded 후보 read를 제거했으며 실제 cutover·UAT·서명은 `NOT_RUN`이다.
- `ACC-P6-45`에서 G3·G4·P5·provider·candidate 5개 제어 JSON을 각각 한 번 읽는 동일 atomic bounded snapshot으로 후보 검사를 통합했다. 전체 read 전후 root/file identity·realpath·size를 재검증해 서로 다른 시점의 원천·후보 조합을 차단했으며 실제 cutover·UAT·서명은 `NOT_RUN`이다.
- `ACC-P6-46`에서 rollback readiness의 G3 증거 direct read를 physical JSON·1MiB·realpath·read-after 안정성·fatal UTF-8·object-only bounded reader로 교체했다. 실제 Production 이미지 revision·필수 volume 2/2·과거 drill·backup/restore는 PASS지만 실제 rollback은 `NOT_RUN`이다.
- `ACC-P6-47`에서 cutover preflight의 backup manifest 직접 무제한 read를 제거하고 exact Production physical manifest 64KiB·realpath·fatal UTF-8·object-only 검증과 실제 dump bytes·streaming SHA-256·restore evidence를 결합했다. 최신 backup 318,811 bytes와 manifest 673 bytes가 PASS했지만 실제 cutover는 `NOT_RUN`이다.
- `ACC-P6-48`에서 cutover preflight의 health·readiness·anonymous API 응답 직접 무제한 `arrayBuffer()`를 제거하고 각 응답을 5초·1MiB·fatal UTF-8·JSON object-only로 검증했다. 실제 세 응답은 36/241/134 bytes와 exact 200/200/401로 PASS했지만 실제 cutover는 `NOT_RUN`이다.
- `ACC-P6-49`에서 ingress publication·route-disable의 Cloudflare API와 authoritative DoH A/CNAME 직접 무제한 `response.json()`을 제거하고 API 10초·DoH 5초·1MiB·fatal UTF-8·JSON object-only 공용 reader를 적용했다. 과대 공급자 응답의 게시·미게시 성공 승격을 차단했지만 실제 tunnel·DNS/TLS 변경은 `NOT_RUN`이다.
- `ACC-P6-50`에서 ADMIN·MANAGER·USER MFA/RBAC core smoke의 직접 무제한 `response.json()`을 제거하고 10초·1MiB·fatal UTF-8·JSON object-only 공용 reader를 적용했다. 과대·비정상 응답의 인증 성공 승격을 차단했지만 실제 역할 계정·MFA·로그인·서명은 `NOT_RUN`이다.
- `ACC-P6-51`에서 authenticated CSRF/idempotency runner의 직접 무제한 `response.json()`을 제거하고 10초·1MiB·fatal UTF-8·JSON object-only 공용 reader를 적용했다. 과대·비정상 응답의 쓰기·replay·conflict 성공 승격을 차단했지만 실제 인증 쓰기와 서명은 `NOT_RUN`이다.
- `ACC-P6-52`에서 CSRF/idempotency 음성 baseline의 직접 무제한 `response.json()`을 제거하고 10초·1MiB·fatal UTF-8·JSON object-only 공용 reader를 적용했다. 과대·비정상 응답의 CSRF 거부 성공 승격을 차단했으며 실제 음성 기준선은 PASS했지만 실제 인증 쓰기와 서명은 `NOT_RUN`이다.
- `ACC-P6-53`에서 P6→P7 승격기의 `docs/current-state.md`·`docs/roadmap.md` 읽기를 exact physical file·1MiB·read-after identity/realpath/size·fatal UTF-8로, clean worktree Git 검사를 10초·1MiB·shell 금지로 제한했다. actual cutover 증거가 없어 실제 Phase 승격은 `NOT_RUN`이다.
- `ACC-P6-54`에서 기존 Production ingress config를 exact runtime `cloudflared.yml` physical file·16KiB·read-after identity/realpath/size·fatal UTF-8로 제한했다. 과대·redirect·교체·invalid encoding은 설정 일치 증거로 승격하지 않으며 실제 tunnel·DNS/TLS 변경은 `NOT_RUN`이다.
- `ACC-P6-55`에서 `operations:cutover-gate`의 승인 문서를 physical JSON object·4MiB·read-after identity/realpath/size·fatal UTF-8로 제한했다. `--allow-template`은 공식 template 한 경로에만 허용하며 실제 cutover·DNS/TLS·역할 UAT·서명은 `NOT_RUN`이다.
- `ACC-P6-56`에서 Goal Harness의 `MASTER_ROADMAP.json`·가속 큐를 각각 한 번 읽은 동일 physical bounded snapshot으로 통합했다. 두 파일 전체의 read 전후 repository·file identity/realpath/size를 재검증해 서로 다른 시점의 Phase·READY 상태 조합을 차단했으며 실제 cutover·DNS/TLS·역할 UAT·서명은 `NOT_RUN`이다.
- `ACC-P6-57`에서 Goal Harness의 `P2_RELEASE_CANDIDATE.json`·`P2_REMOTE_EVIDENCE.json`을 각각 한 번 읽은 동일 physical bounded snapshot으로 통합했다. 전체 read 전후 repository·harness directory·file identity/realpath/size를 재검증해 서로 다른 시점의 candidate·CI·release provenance 조합을 차단했으며 실제 cutover·DNS/TLS·역할 UAT·서명은 `NOT_RUN`이다.
- `ACC-P6-58`에서 Goal Harness의 release candidate content fallback을 저장소 상대 정규 경로·중복 없음·physical regular file·파일당 8MiB·최대 512개·합계 64MiB·각 1회 read·전체 read-after identity/realpath/size 검증으로 제한했다. 경로 이탈·과대 입력·서로 다른 시점의 candidate hash 조합을 차단했으며 실제 cutover·DNS/TLS·역할 UAT·서명은 `NOT_RUN`이다.
- `ACC-P6-59`에서 P6→P7·P7→8/8 전환의 rollback 원본을 atomic control snapshot의 actual raw bytes와 bounded physical 문서 snapshot으로 통합했다. terminal completion의 Git 상태 확인도 10초·1MiB·shell 금지 reader로 제한했으며 실제 Phase 전환·DNS/TLS·역할 UAT·서명은 `NOT_RUN`이다.
- `ACC-P6-60`에서 역사적 P2 candidate manifest와 remote candidate commit의 actual blobs를 bounded Git으로 대조했다. 12개 해시 중 7개 일치·5개 불일치를 별도 atomic attestation으로 보존하고 `deploymentBasis=false`를 강제했으며 현재 P6 candidate·actual cutover·DNS/TLS·역할 UAT·서명은 변경하지 않았다.
- `ACC-P7-62`에서 P7 단일 운영 증거 writer 16개를 fsync 임시파일→hard-link no-replace 공용 writer로 통합했다. 최종 경로를 다른 실행이 먼저 만들면 기존 bytes를 보존하고 임시파일을 제거하며, 실제 P6 cutover와 P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P7-63`에서 backup·restore 증거쌍을 출력별 create-only no-replace와 동일 pair provenance로 결합했다. 두 별도 경로 전체의 원자성을 주장하지 않고 두 번째 출력 충돌을 명시적 1/2 부분 게시로 보존·탐지하며, 혼합 증거쌍은 인수 완료로 승격하지 않는다. 실제 P6 cutover와 P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-64`에서 ADMIN·MANAGER·USER actual 역할 결과를 세 경로 사전검증과 출력별 create-only no-replace로 게시하도록 바꿨다. 실행 중 경쟁은 명시적 부분 게시로 보존·탐지하고 동일 `resultSetPublicationId`가 아닌 혼합 역할 결과는 actual cutover로 승격하지 않는다. 실제 역할 UAT·P6 cutover와 P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-65`에서 actual cutover 최종 증거·signoff pause checkpoint·12-Gate step/summary receipt를 공용 fsync·hard-link no-replace writer로 통합했다. 세 출력 경로 모두 경쟁자가 만든 최종 bytes를 보존하고 임시파일을 제거하며, 실제 역할 UAT·P6 cutover와 P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-66`에서 Production cloudflared config와 tunnel credential을 fsync·hard-link no-replace로 게시하도록 강화했다. credential 원문을 읽지 않고 충돌 시 선점 bytes와 복구용 생성 credential을 보존하며, tunnel create 성공은 후속 게시 실패와 무관하게 외부 변경으로 기록한다. 실제 tunnel·DNS/TLS·역할 UAT·P6 cutover와 P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-67`에서 actual ingress publication에 create-only 단일 writer lease를 추가했다. tunnel 생성 전에 lease를 획득하고 동시 두 번째 실행은 외부 변경 없이 대기하며, 자기 소유 lease만 해제하고 stale·다른 owner lease는 자동 삭제하지 않는다. 실제 tunnel·DNS/TLS·역할 UAT·P6 cutover와 P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-68`에서 crash stale ingress lease의 명시적 복구 경로를 추가했다. dry-run이 기본이며 실제 삭제는 5분 age·owner PID 부재·승인 변경창·exact confirmation·삭제 직전 물리 identity와 owner 재검증을 모두 통과해야 한다. 현재 lease와 실제 복구·tunnel·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-69`에서 기존 Production cloudflared process 판정을 exact executable·정확한 `--config` Windows 인자·단일 PID 계약으로 강화했다. 부분 문자열·실행 파일 불일치·다중 PID·관측 오류는 새 process 시작 전에 fail-closed하며 실제 process·tunnel·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-70`에서 새 Production cloudflared process가 비동기 `spawn` acknowledgement와 유효 PID를 확인한 뒤에만 시작 성공을 기록하도록 강화했다. 오류·invalid PID·5초 timeout은 원문 없이 fail-closed하고 timeout/invalid PID child를 best-effort 정리하며 실제 process·tunnel·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-71`에서 Production public route rollback의 Cloudflare zone과 DNS record 전체 identity를 삭제 전에 고정했다. exact ID·zone/name/status·CNAME·tunnel content·proxied 조건을 모두 만족한 selected record만 삭제하며 malformed·복수·불일치 provider 응답은 mutation 전에 fail-closed한다. 실제 DNS 삭제·tunnel·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-72`에서 Production public ingress publication의 Cloudflare zone과 DNS record 전체 identity를 게시 전에 고정했다. exact ID·zone/name/status·CNAME·tunnel content·proxied·TTL 조건을 검증하고 record 부재만 생성을 허용하며 생성 뒤 exact record를 재관측해야 성공한다. 실제 DNS 게시·tunnel·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-73`에서 Production public ingress의 Cloudflare tunnel과 connection identity를 고정했다. exact name·UUID·created/deleted 상태와 connection UUID·colo·origin IP·openedAt·pending 형식을 검증하고 non-pending connection만 connected로 인정한다. 실제 tunnel 생성·연결·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-74`에서 cloudflared tunnel create의 token-bearing JSON 출력을 제거했다. Secret 없는 기본 확인문의 exact name·UUID와 bounded 원격 재관측 UUID가 일치한 뒤에만 credential/config를 게시하며 provider create 직후 mutation은 즉시 기록한다. 실제 tunnel 생성·credential/config 게시·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-75`에서 Production ingress 부분 실패 복구 preflight를 추가했다. exact tunnel, 임시·최종 credential 존재, config, process와 public DNS를 Secret 원문 없이 함께 관측하고 관측 실패는 fail-closed하며 부분 산출물은 삭제 없이 복구 검토로 격리한다. 현재 여섯 구성요소는 모두 부재해 orphan 없음이 PASS했고 실제 복구 삭제·tunnel·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-76`에서 Production ingress exact orphan 복구 실행기를 추가했다. 변경창·exact confirmation·single-writer lease·UUID 재관측을 요구하고 no-force tunnel delete 뒤 원격 부재를 확인한 다음 동일 physical identity의 임시 credential만 제거한다. 현재 복구 대상은 0건이며 실제 삭제·tunnel·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-77`에서 cutover ingress publication step 실패 containment를 강화했다. exact public route-disable 뒤 orphan recovery를 조건부 실행하고 두 증거가 모두 확인돼야 격리 PASS한다. 정상 성공 경로는 12 Gate·14 step을 유지하며 실제 복구·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-78`에서 cutover child step 예외의 gate·step identity를 bounded 상태로 보존했다. ingress publication 예외도 generic handler 실패로 축약되지 않고 route-disable·orphan recovery 격리를 선택하며 오류 원문은 기록하지 않는다. 실제 예외·복구·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-79`에서 cutover 정상 14개와 route-disable·ingress orphan recovery 2개 child의 환경을 canonical step별 allowlist로 격리했다. 안전한 OS runtime 외에는 현재 단계에 명시된 reference·confirmation만 전달하고 unrelated Secret·`GITHUB_TOKEN`·`NODE_OPTIONS`와 변조 step을 spawn 전에 차단한다. 실제 child·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-80`에서 cutover 정상 14개와 containment 2개 step의 gate·ID·전이 로컬 source byte를 bundle SHA-256으로 고정했다. child spawn 전후와 receipt·checkpoint·resume·actual evidence의 manifest가 다르면 fail-closed 중단한다. 실제 child·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-81`에서 P6 cutover child의 기본 timeout을 10분, stdout·stderr 합산 상한을 1MiB로 제한했다. timeout·출력 초과·spawn·signal 실패는 child 종료 뒤 오류 원문이나 stale PASS summary 없이 bounded receipt로 남는다. 실제 child·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-82`에서 정상 cutover child timeout을 rollback cutoff 전 2분 containment reserve가 남도록 동적으로 제한했다. reserve 소진 뒤 정상 child는 실행하지 않고 route-disable·ingress orphan recovery만 기존 bounded profile로 실행한다. 실제 child·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-83`에서 2분 containment reserve를 route-disable 50초, ingress orphan recovery 50초, 종료 유예 합계 10초, orchestration 여유 10초로 완전히 분할했다. 상위 timeout 확장과 작은 reserve가 격리 완료 시간을 무효화하지 못하도록 fail-closed한다. 실제 containment·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-84`에서 actual P6 evidence의 step·Gate receipt, 역할 결과와 3개 서명을 변경창 시작부터 22:00 rollback cutoff까지로 제한했다. 22:00 이후 문서는 유효한 형식이어도 Production GO 후보로 승격하지 않는다. 실제 receipt·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-85`에서 runtime receipt JSON에 1~26 sequence를 기록하고 actual P6 assembler가 14개 step·12개 Gate receipt의 연속·고유 sequence와 정해진 identity 순서를 검증하도록 강화했다. 중복·누락·교환 sequence는 Production GO 후보로 승격하지 않는다. 실제 receipt·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-86`에서 actual P6 assembler가 runtime receipt의 물리 파일명을 payload의 canonical UTC checkedAt·4자리 sequence·kind·Gate·step과 정확히 대조하도록 강화했다. 파일명 rename이나 payload 불일치는 Production GO 후보로 승격하지 않는다. 실제 receipt·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-87`에서 actual P6 assembler가 1~26 receipt checkedAt의 비감소 순서, 역할 결과와 role-core-smoke receipt의 exact 시각, rollback Gate 이후부터 signoff-preflight receipt 이전까지의 실제 서명 경계를 검증하도록 강화했다. 인과 순서가 뒤집힌 증거는 Production GO 후보로 승격하지 않는다. 실제 receipt·DNS/TLS·역할 UAT·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-88`에서 BUSINESS·SECURITY·OPERATIONS 실제 서명을 동일 역할 결과 publication set ID와 서명 직전 rollback Gate receipt SHA-256에 결박했다. 같은 run 안의 다른 역할 결과 세트나 rollback receipt를 참조한 서명은 Production GO 후보로 승격하지 않는다. 실제 서명·DNS/TLS·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-89`에서 Gate 1~11 checkpoint와 동일 atomic receipt snapshot 및 ADMIN·MANAGER·USER actual 역할 결과 publication set을 검증해 BUSINESS·SECURITY·OPERATIONS용 unsigned 서명 요청 bundle 3건을 저장소 밖 create-only로 조립하도록 준비했다. 요청은 동일 run·release·core/rollback receipt SHA·역할 결과 set을 고정하며 실제 bundle·서명·identity·MFA·메시지·DNS/TLS·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-90`에서 세 실제 서명을 deterministic unsigned request set ID와 준비 시각에 결박했다. actual assembler는 run·release·core/rollback receipt·역할 결과 publication set·preparedAt에서 ID를 재계산하고 요청 준비 시각이 rollback Gate 이후 각 서명 이전이며 rollback cutoff 안인지 검증한다. 실제 request·서명·DNS/TLS·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-91`에서 세 실제 서명을 사람이 검토한 저장소 밖 물리 unsigned request bundle SHA-256에 결박했다. actual assembler와 signoff resume가 물리 bundle 전체 provenance·세 unsigned payload·signer instruction을 재검증하고 최종 P6 actual evidence에 bundle SHA를 보존한다. 실제 request·서명·DNS/TLS·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-92`에서 업무·보안·운영 실제 서명을 별도 물리 MFA 승인 receipt SHA-256에 결박했다. receipt의 동일 run·release·request set·request bundle·signer·signedAt, MFA verified provider identity와 고유 receiptId를 actual assembler와 signoff resume가 검증한다. 실제 MFA receipt·서명·DNS/TLS·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P6-93`에서 검토된 unsigned request bundle과 외부 MFA 승인 receipt 3건으로 실제 업무·보안·운영 서명 문서 3건을 안전하게 조립하는 진입점을 준비했다. 변경창·exact confirmation·저장소 밖 물리 입력과 신규 출력이 모두 있어야 입력을 읽고, receipt와 request provenance를 교차검증한 뒤 create-only로 게시한다. 승인 자체와 실제 MFA receipt·서명·DNS/TLS·P6 cutover·P7 운영 활성화는 `NOT_RUN`이다.
- `ACC-P7-64`에서 19단계 운영 활성화 sequence와 운영 8영역·서명·handover finalizer 10문서를 동일 release SHA와 exact `https://inventory.safe-link.co.kr` provenance로 종단 결박했다. release·target 경계 변조는 fail-closed하고 합성 파일은 모두 제거되며 실제 P6 cutover·P7 활성화·운영 증거·서명은 `NOT_RUN`이다.
- `ACC-P6-94`에서 actual signoff 조립기를 cutover signoff resume에 직접 연결했다. 변경창·동일 run/release·역할 결과·MFA receipt·resume 및 두 조립 확인·외부 신규 출력이 모두 맞아야 signoff 3건 → Gate 12 → actual P6 evidence를 같은 호출에서 수행하며, 입력 누락은 무읽기·무쓰기이고 부분 signoff set·조립/최종화 실패는 route-disable로 격리한다. focused 21/21, 구문 420/420, 단위 880 PASS·8 SKIP, Harness verify와 GitHub Quality `33670549078`이 PASS했으며 실제 외부 작업은 `NOT_RUN`이다.

## 6. Phase 갱신 절차

현재 Phase가 해결될 때만 다음 네 항목을 한 번 갱신한다.

1. 현재 Phase를 `✅ 증거 있는 완료`로 바꾸고 증거 링크 또는 명령 결과를 기록한다.
2. 진척도 분자를 1 올린다.
3. 다음 Phase 하나만 `🔄 진행 중`으로 바꾼다.
4. `docs/current-state.md`의 최신 작업 오버레이와 다음 READY를 같은 사실로 맞춘다.
