# 서원토건 비품관리 시스템 최신 단일 현황

기준일: 2026-08-15

브랜치: `agent/productization-completion-chain`

상태: **로컬 제품 검증 PASS / 외부 운영 전환 NO-GO / AI PC 연결 HOLD**

이 문서는 현재 상태의 단일 정본이다. 과거 Phase 보고서의 당시 수치와 설계 결정은 역사 증거로 보존하되 현재 판정에는 이 문서와 실제 코드·테스트 결과를 우선한다.

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
6. `Frosty city man`의 정확한 GitHub username이 없어 reviewer/협업자 지정이 보류됐다.
7. main merge와 production 배포는 승인·증거가 충족될 때까지 실행하지 않는다.

## 다음 READY

저장소 내부 READY는 최신 변경 commit·push와 PR CI 확인이다. 외부 READY는 정확한 GitHub username 또는 AI PC G1~G3 비밀 없는 증거 중 사용자가 먼저 제공하는 하나다.
# Phase 74 불변 이미지 릴리스 게이트 (2026-08-15)

- GitHub Actions 외부 참조를 공식 commit SHA로 고정하고, main의 정확한 SHA로 frontend/backend 이미지를 GHCR에 발행하는 workflow를 추가했다.
- production은 `sha-<40자리 git sha>`와 서로 다른 공식 GHCR 이미지 두 개만 허용하며 외부 호스트에서 재빌드하지 않는다.
- 로컬 검증은 구문 93개, 단위 107/107, Compose 3서비스 계약, 저장소 위생, workflow YAML, PowerShell parser, diff 검사를 통과했다.
- PR CI·main 병합·GHCR digest는 원격 실행 후 증거를 갱신한다. 운영 서버·Secret·DNS/TLS·UAT 서명·AI PC G1~G5가 없어 production은 NO-GO다.
