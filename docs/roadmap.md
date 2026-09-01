# SQCM-i 비품관리 시스템 전체 로드맵

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
| P6 Production 전환 | 최종 승인, cutover, 관측·복구 확인 | 🔄 진행 중 | P3~P5 PASS, 승인된 변경 시간, cutover·rollback 증거 | 후보 `e238ab8…`의 CI·불변 이미지, AI PC loopback Production 3서비스, migration 25/25, backup·restore·rollback PASS. 공개 DNS/TLS·실사용자 MFA·최종 서명이 남음. READY `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF` |
| P7 운영·유지보수 활성화 | 백업, 경보, 온콜, 정기 점검, 개선 큐 | ⏳ 미착수 | 운영 백업·경보 수신·복구훈련과 책임자 인수 | P6 완료 후 시작 |

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
- 현재 상태: 후보 `e238ab8dab7f…`의 불변 이미지, AI PC PostgreSQL 16 loopback Production 3서비스, migration 25/25, backup·restore·rollback·재기동과 공급자 5종 읽기 전용 preflight가 PASS했다. 공개 DNS·TLS·외부 health/readiness, logs/5xx·outbox와 역할별 core smoke 선행조건 Gate도 Harness에 준비됐으나 실제 post-cutover 실행은 `NOT_RUN`이다. 역할 preflight는 ADMIN·MANAGER·USER active/MFA 0명과 credential reference 0/3을 명시해 외부 입력을 기다린다. cutover 증거는 12개 Gate 중 로컬 4건 PASS·외부 8건 PENDING이다. P6-G4는 `READY_WAIT_CHANGE_WINDOW`이며 Production hostname은 NXDOMAIN, 전용 tunnel과 실제 사용자는 0이다. 기존 staging·tunnel·보호 서비스는 보존됐고 `productionGo=false`다.
- 다음 READY: **P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF**. 승인된 `2026-09-11 20:00~23:00 KST` 변경창에서 공개 DNS/TLS, 실제 사용자 로그인·MFA, 관측과 업무·보안·운영 최종 서명을 검증한다.

## 6. Phase 갱신 절차

현재 Phase가 해결될 때만 다음 네 항목을 한 번 갱신한다.

1. 현재 Phase를 `✅ 증거 있는 완료`로 바꾸고 증거 링크 또는 명령 결과를 기록한다.
2. 진척도 분자를 1 올린다.
3. 다음 Phase 하나만 `🔄 진행 중`으로 바꾼다.
4. `docs/current-state.md`의 최신 작업 오버레이와 다음 READY를 같은 사실로 맞춘다.
