# 서원토건 비품관리 시스템 최신 단일 현황

기준일: 2026-08-25

릴리스 기준 브랜치: `main`
현재 작업 브랜치: `codex/fix-sidebar-accessibility` (`112ff5a03112b63a5ce23ac00bc64e418e3625b4`)

상태: **로컬 제품 검증 PASS / 외부 운영 전환 NO-GO / AI PC 연결 HOLD**

이 문서는 현재 상태의 단일 정본이다. 과거 Phase 보고서의 당시 수치와 설계 결정은 역사 증거로 보존하되 현재 판정에는 이 문서와 실제 코드·테스트 결과를 우선한다.

전체 순서와 한 번에 한 Phase만 진행하는 규칙은 [`docs/roadmap.md`](./roadmap.md)에서 시각화한다. P1 UI 접근성 안정화는 2026-08-21에 증거 있는 완료가 됐고, 현재 실행 Phase는 **P2 릴리스 기준선·CI**다. P2 종료 전에는 P3를 시작하지 않는다.

장기 실행 계약은 [`agent docs/prompts/79_장기_Goal_Harness_메타프롬프트.md`](../agent%20docs/prompts/79_장기_Goal_Harness_메타프롬프트.md), 기계 상태는 [`agent docs/harness/MASTER_ROADMAP.json`](../agent%20docs/harness/MASTER_ROADMAP.json)이 소유한다. 2026-08-25 strict 계약 8/8과 Harness 불변식 오류 0건을 확인했고, P2 로컬 READY는 구문 96, 단위 109/109, 통합 20/20, UI 계약 16, Compose·Docker 3/3 healthy, smoke·유지보수 점검으로 통과했다. SQCM-i 모델 37개·Awake 8개와 기존 보호 listener를 보존했다. 다음 READY는 외부 Git 변경 승인이 필요한 `P2-GIT-DRAFT-PR-APPROVAL`이다.

## 2026-08-21 작업 오버레이

- `codex/fix-sidebar-accessibility`에서 데스크톱 sidebar overflow, 모바일 user box, nav backdrop 클릭 경계를 수정했다.
- P1 기능 변경은 프런트엔드 3개와 UI 계약 검사 1개, 총 4개 파일이다. 이후 로드맵·Harness·증거 문서가 별도 추가됐으며 전체 후보는 아직 commit·push하지 않았다.
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
2. UAT 체크 19항목과 업무·보안·운영 책임자 3명 서명이 비어 있다.
3. 실제 operations manifest와 cutover evidence는 없고 저장소에는 계약용 template만 있다.
4. 회사 OIDC, 외부 저장소, 악성코드 검사, event publisher, 경보 채널, PITR/WAL 증거가 없다.
5. AI PC의 독립 runtime·모델 checksum·listener·TLS·인증·G1~G5 UAT가 없다.
6. main merge와 production 배포는 승인·증거가 충족될 때까지 실행하지 않는다.

## 다음 READY

현재 유일한 READY는 로드맵 **P2 allowlist stage·commit·origin 작업 브랜치 push·main 대상 Draft PR 승인 확인**이다. 승인 전에는 Git 외부 변경이나 원격 CI를 실행하지 않는다. merge·release·main push는 이번 승인 범위에 포함하지 않는다. 외부 #14 AI PC, #12 운영 인프라, #13 UAT는 P3~P5의 승인된 보류로 유지한다. `Frosty city man`은 범소프트 팀장이며 GitHub 연결 대상이 아니고, 저장소 소유 계정은 `visionlab-coder` 하나로 유지한다.
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
