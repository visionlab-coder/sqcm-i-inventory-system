# SQCM-i 비품관리 시스템 전체 로드맵

<!-- HARNESS_STATUS_START -->
Harness 진행: **6 / 8 Phase 완료**
현재 Phase: **P6**
현재 READY: `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`
Production GO: **false**
<!-- HARNESS_STATUS_END -->

기준일: 2026-09-01

상태 정본: [`docs/current-state.md`](./current-state.md)

장기 실행 상태: [`agent docs/harness/MASTER_ROADMAP.json`](../agent%20docs/harness/MASTER_ROADMAP.json)

로드맵 역할: 전체 진행 순서와 현재 실행 Phase를 한 화면에 고정한다. 과거 `docs/phase-reports/`의 Phase 번호는 역사 증거이며, 새로운 실행 순서를 결정하지 않는다.

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
    P5 --> P6["P6 Production 전환<br/>🔄 G2 Git·CI·이미지 PASS"]
    P6 --> P7["P7 운영·유지보수 활성화<br/>⏳ 대기"]

    classDef done fill:#DCFCE7,stroke:#15803D,color:#14532D,stroke-width:2px;
    classDef active fill:#DBEAFE,stroke:#1D4ED8,color:#1E3A8A,stroke-width:4px;
    classDef pending fill:#F3F4F6,stroke:#6B7280,color:#374151,stroke-width:2px;
    classDef hold fill:#FEF3C7,stroke:#B45309,color:#78350F,stroke-width:2px;
    classDef blocked fill:#FEE2E2,stroke:#B91C1C,color:#7F1D1D,stroke-width:4px;
    class P0,P1,P2,P3,P4,P5 done;
    class P6 active;
    class P7 pending;
```

진척도: **6 / 8 Phase 완료**

현재 위치: **P6 Production 전환**

다음 Phase: **P7 운영·유지보수 활성화** — P6 전환 증거 완료 전에는 시작하지 않는다.

## 3. 실행 Phase 판정표

| Phase | 범위 | 상태 | 완료 조건 | 현재 증거 또는 차단 입력 |
|---|---|---|---|---|
| P0 로컬 제품 기준선 | 저장소 확보, Wi-Fi 대체 게이트, 로컬 Docker 3계층, DB·API·UI 기본 검증 | ✅ 증거 있는 완료 | 로컬 서비스 healthy, 필수 테스트 PASS, 보호 서비스 보존 | Wi-Fi 사용 가능, Docker 3/3 healthy, 구문 95, 단위 109/109, 통합 20/20 |
| P1 UI 접근성 안정화 | 데스크톱·모바일 메뉴, 로그아웃 접근성, 클릭 차단 회귀 수정 | ✅ 증거 있는 완료 | 변경 diff 검토, UI 계약 16 PASS, 역할별 브라우저 확인, 변경 기준선 확정 승인 | UI 계약 16, 구문 95, 단위 109/109, 통합 20/20 PASS. 1280×720 및 390×844 로그아웃 동작 확인 |
| P2 릴리스 기준선·CI | P1·Harness 변경 commit, PR, 원격 CI, 불변 이미지 기준선 | ✅ 증거 있는 완료 | 승인된 commit/push/PR, CI PASS, main 병합 후 정확한 SHA·이미지 digest 기록 | main `79a1292…`, PR #22, main quality·release-images PASS, backend/frontend digest 기록 |
| P3 AI PC 연동 | 독립 bridge/runtime/model, G1~G5, fallback | ✅ 증거 있는 완료 | checksum, listener, TLS·인증, health/ready, 계약·rollback PASS | G0~G5, Pilot UAT 19/19, 승인 3/3, Defender·경보 receipt PASS |
| P4 Staging 인프라·배포 | 전용 hostname, 공급자, Secret reference, backup, staging 배포 | ✅ 증거 있는 완료 | backup→migration→불변 이미지→health/smoke→rollback PASS | non-seed·DNS/TLS·provider·OIDC·backup/migration·rollback·off-site readback·signoff 3/3 PASS |
| P5 역할별 UAT | 19개 UAT와 업무·보안·운영 책임자 검수 | ✅ 증거 있는 완료 | staging 19개 PASS, Critical/High 0, 책임자 실제 서명 | 기술 UAT 19/19·Critical/High 0·업무/보안/운영 전자서명 3/3 |
| P6 Production 전환 | 최종 승인, cutover, 관측·복구 확인 | 🔄 진행 중 | P3~P5 PASS, 승인된 변경 시간, cutover·rollback 증거 | 후보 `e238ab8…`의 CI·불변 이미지, AI PC loopback Production 3서비스, migration 25/25, backup·restore·rollback PASS. UAT actor transaction provision, exact Cloudflare ingress publication·route-disable, active branch provenance, 12개 Gate별 실패 격리 매트릭스, 순차 실행 상태 머신, 14-step adapter, redacted receipt runner, runId·SHA actual evidence assembler, 역할별 actual 결과 compiler, Gate 1~11→서명→Gate 12·actual finalizer 원자 재개·실패 자동 route-disable, actual 증거 기반 P6 완료/P7 활성화 전환기와 변경창 입력 5참조 미무장 준비 Gate가 준비됐고 실제 참조는 0/5, 공개 DNS/TLS·실사용자 MFA·최종 서명·actual 생성은 남음. READY `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF` |
| P7 운영·유지보수 활성화 | 백업, 경보, 온콜, 정기 점검, 개선 큐 | ⏳ 미착수 | 운영 백업·경보 수신·복구훈련과 책임자 인수 | 운영 8영역 compiler·책임자 signoff input assembler/compiler, exact HTTPS 30일 SLO 수집기, 5종 경보 delivery runner, exact TLS 관측기, primary→escalation on-call drill runner, 일일점검 runner, consistent snapshot off-site backup·격리 restore runner, canonical 승인 digest·release SHA·single-writer lease·receipt root 단일 승인 run 귀속·no-overwrite 영수증이 적용된 19단계 1회 1단계 재개 오케스트레이터, 10문서 합성 종단 리허설과 actual 인수 뒤 8/8 원자 완료 전환기 PASS. 실제 활성화는 P6 완료 후 시작 |

## 4. 전역지침 11단계 연결

| 전역 단계 | 현재 판정 | 실행 Phase 연결 |
|---|---|---|
| 1 목표 | ✅ 증거 있는 완료 | P0 |
| 2 문서 | ✅ 증거 있는 완료 | P0 및 이 로드맵 |
| 3 요구사항 | ✅ 증거 있는 완료 | P0 |
| 4 기능 | ✅ 증거 있는 완료 | P0 |
| 5 인프라 | 로컬 ✅ / 운영 🔒 | P0, P4 |
| 6 DB | 로컬 ✅ / 운영 🔒 | P0, P4 |
| 7 화면 | ✅ 증거 있는 완료 | P1 |
| 8 개발 | 기준선·릴리스 기준선 ✅ | P2 |
| 9 배포 | 불변 이미지 ✅ / staging·production 🔒 | P2, P4, P6 |
| 10 통합 테스트 | 로컬 ✅ / 실사용자 🔒 | P0, P5 |
| 11 유지보수 | 계약 ✅ / 운영 활성화 ⏳ | P7 |

## 5. 현재 Phase 카드 — P6

- 목표: P3~P5 완료 증거를 바탕으로 운영 대상·불변 이미지·backup/migration·cutover·rollback·관측 계약을 실제 Production 증거로 닫는다.
- 사전 증거: P3 AI PC 19/19·서명 3/3, P4 staging/rollback/off-site backup·서명 3/3, P5 UAT 19/19·서명 3/3.
- 비범위: 별도 승인 없는 Production 배포·migration·DNS/TLS·Secret·commit·push·merge·release.
- 현재 상태: 후보 `e238ab8dab7f…`의 불변 이미지, AI PC PostgreSQL 16 loopback Production 3서비스, migration 25/25, backup·restore·rollback·재기동과 공급자 5종 읽기 전용 preflight가 PASS했다. Harness 기계 정본 branch는 실제 `codex/p6-ai-pc-postgres-production`과 일치하며 local·GitHub Actions branch provenance 불일치를 fail-closed 한다. 공개 DNS·TLS·외부 health/readiness, logs/5xx·outbox, 역할별 core smoke, nonfunctional, operational health, CSRF/idempotency, rollback readiness와 최종 서명 preflight가 준비됐다. 12개 Gate 각각의 실패 매트릭스는 12/12에서 실패 지점 이후 실행을 중단하고 public route-disable 확인으로 격리하며 미확인 rollback을 차단했다. 변경창 실행 상태 머신은 window·confirmation·handler 계약을 선검사하고 cutoff·첫 실패·예외에서 이후 Gate를 중단하며 route-disable evidence 없이는 containment를 금지한다. 14-step adapter는 exact runner 인자·PASS 상태·evidence reference를 강제해 exit 0의 대기 결과 승격을 막는다. P7 운영 활성화 19단계는 정상·WAIT 재개 물리 receipt 흐름과 함께 각 단계 동일 실패 3회 격리 매트릭스 19/19, 이후 단계 receipt 0건을 합성 검증했다. 승인된 세 역할을 MFA·scope·session revoke·audit와 함께 transaction provision하는 실행기와 exact Cloudflare tunnel·runtime config·proxied CNAME publication, 실패 시 exact route-disable 실행기도 준비됐지만 실제 계정/API/DNS/process 변경은 `NOT_RUN`이다. 역할 preflight는 ADMIN·MANAGER·USER active/MFA 0명과 credential reference 0/3을 명시하고, 서명 preflight는 역할별 결과·업무·보안·운영 참조 0/6을 명시해 외부 입력을 기다린다. cutover 증거는 12개 Gate 중 로컬 4건 PASS·외부 8건 PENDING이다. P6-G4는 `READY_WAIT_CHANGE_WINDOW`이며 Production hostname은 NXDOMAIN, 전용 tunnel과 실제 사용자는 0이다. 기존 staging·tunnel·보호 서비스는 보존됐고 `productionGo=false`다.
- 다음 READY: **P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF**. 승인된 `2026-09-11 20:00~23:00 KST` 변경창에서 공개 DNS/TLS, 실제 사용자 로그인·MFA, 관측과 업무·보안·운영 최종 서명을 검증한다.
- 가속 Packet: **ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF**. P6 cutover finalizer는 정확히 12개 고유 Gate·세 역할 UAT·3개 승인·불변 SHA·정확한 URL을 강제한다. P7 finalizer는 P6 cutover·운영 8영역·운영 서명 10개 실제 JSON의 path·SHA-256과 영역별 측정값을 검증하고, assembler는 P6 완료·P7 활성화 뒤 저장소 밖 manifest를 선검증·원자적 1회 쓰기로 조립한다. SLO compiler는 exact Production URL의 30일 측정 원본에서 가용성·p95를 직접 계산한다. Alert delivery runner는 승인된 공개 HTTPS 공급자에 5종 경보를 deterministic idempotency로 전송해 실제 DELIVERED receipt를 만들고 alerting compiler가 고유 receipt를 재검증한다. Backup/restore compiler는 24시간 RPO·30일 off-site retention·checksum과 4시간 RTO·격리 복원·count/migration 일치를 검증한다. Certificate compiler는 최근 TLS 관측의 exact hostname·chain·fingerprint·유효기간·30일 갱신 lead와 health/readiness를 검증한다. On-call drill runner는 승인된 Asia/Seoul 30일 당번표의 서로 다른 수락 책임자에게 primary→escalation 시험을 멱등하게 보내 5분·15분 고유 ACK receipt를 만들고 onCall compiler가 최근 7일 drill과 provenance를 재검증한다. Maintenance compiler는 불변 release의 최근 일일 점검 6종과 24시간 다음 일정·고유 receipt를 검증한다. ImprovementQueue는 read-only GitHub collector가 승인된 triage attestation과 고정 label·단일 bounded metadata로 actual export를 만들고 compiler가 최근 triage·책임자·수용조건·후속기한·미추적 finding 0건을 재검증한다. Operations signoff compiler는 P6 SHA와 8영역 고유 PASS SHA, OPERATIONS_OWNER identity·최근 receipt·운영 업무 6종 수락·차단 예외 0건을 검증하며 실제 서명은 만들지 않는다. 운영 활성화 오케스트레이터는 19개 child별 환경 allowlist를 강제해 상위 프로세스의 unrelated Secret·GitHub token·`NODE_OPTIONS` 상속을 차단하고, 승인 manifest에 source·entrypoint·19개 child와 재귀 로컬 정적 의존성 graph의 exact bundle SHA-256을 결합한다. 별도 OPERATIONS_OWNER MFA approval receipt SHA와 P6 cutover·OPERATIONS 서명 SHA까지 동일 identity·run·release·bundle·19단계·10행위로 연결해 단일 JSON 자기승인을 차단한다. unsigned approval request assembler는 P6 actual 증거와 현재 bundle digest에서 이 승인 항목을 exact payload로 조립하고, manifest assembler는 외부 MFA receipt와 request·P6·현재 bundle을 교차검증해 receipt signedAt부터 최대 45일인 실행 manifest를 만든다. 읽기 전용 approval-chain preflight는 P6·request·receipt·manifest·현재 bundle 전체를 activation 전에 다시 검증한다. 합성 approval pipeline은 물리 JSON 4개와 변조 3건을 검증하고, approval-to-orchestrator 리허설은 이를 receipt-root claim·첫 `slo-collect` PASS receipt·다음 `slo-compile` 선택까지 연결한다. 전체 sequence 리허설은 동일 approval SHA 아래 19개 물리 receipt를 끝까지 기록하고, WAIT/재개 및 3회 실패 격리 리허설은 각각 동일 단계 재개와 19/19 정지를 검증한다. process runner 리허설은 실제 진입점의 child 환경·마지막 JSON 판정·redacted receipt 연결을 합성 child 19건으로 sequence complete까지 검증한다. 여섯 리허설 모두 실제 승인·child·activation·Production GO로 승격하지 않는다. 기존 10문서 운영 증거 합성 리허설도 compiler·assembler·finalizer 호환 및 SHA 변조 차단을 검증하고 결과를 즉시 폐기한다. 실제 활성화는 P6 G4 완료와 운영 증거 이후에만 허용하며 P7 상태는 미착수로 유지한다.

## 6. Phase 갱신 절차

현재 Phase가 해결될 때만 다음 네 항목을 한 번 갱신한다.

1. 현재 Phase를 `✅ 증거 있는 완료`로 바꾸고 증거 링크 또는 명령 결과를 기록한다.
2. 진척도 분자를 1 올린다.
3. 다음 Phase 하나만 `🔄 진행 중`으로 바꾼다.
4. `docs/current-state.md`의 최신 작업 오버레이와 다음 READY를 같은 사실로 맞춘다.
