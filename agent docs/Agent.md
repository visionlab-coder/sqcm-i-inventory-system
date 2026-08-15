# Agent.md — 실행 지침

## 목표

서원토건 구성원이 비품의 현재 위치와 책임자를 즉시 확인하고 대여·반납 누락과 재고 부족을 줄이는 시스템을 만든다.

## 작업 순서

방향준비 → 설계 → 구현·검증 → 출시·운영 순서를 따른다. 변경은 Issue → branch → 구현 → 단위 테스트 → 문서 갱신 → commit → PR 흐름을 사용한다.

## 기술 맥락

- 프론트엔드: Nginx가 제공하는 정적 SPA
- 백엔드: Node.js 24, Express JSON API와 기존 EJS 호환 경로
- 데이터베이스: PostgreSQL 16
- 보안: 세션 인증, RBAC, CSRF, BCrypt, Helmet
- Docker Compose로 `frontend`, `backend`, `database` 정확히 3개 서비스 실행
- `frontend`는 UI, `src`는 서버, `db`는 마이그레이션, `test`는 검증, `docs`는 보고서의 단일 출처

## 통제와 금지

- 비밀번호·세션 원문·DB 비밀을 코드와 로그에 남기지 않는다.
- 권한은 화면뿐 아니라 백엔드 라우트에서 검사한다.
- 재고 변경과 대여·반납은 DB 트랜잭션으로 처리한다.
- 데이터 삭제, 운영 배포, 외부 공유는 승인 범위 안에서만 수행한다.
- 운영 Compose에서 백엔드와 DB 포트를 호스트에 공개하지 않는다.

## 완료 정의

요구사항 추적표가 코드·테스트와 연결되고 단위·통합 테스트가 통과하며, 세 Docker 서비스가 healthy이고 핵심 브라우저 스모크와 운영 절차가 문서화된 상태다.

## 메모리

다음 작업에 단계별 결정 기록, 마이그레이션, 테스트 결과와 미완료 배포 항목을 남긴다. 임시 토큰, 테스트 세션, 개인·생계 데이터가 포함된 로그는 남기지 않는다.

## 현재 상태 — Phase 34~39 운영 완성 체인

- 기준 브랜치·커밋은 `agent/quality-security-hardening`의 `8d4a0b3`이며 기업형 기능 FR 35/35와 Phase 24~39 저장소 구현 범위를 완료했다.
- migration 14개·필수 테이블 32개, 구문 검사 64개, 단위 82/82, 통합 17/17을 기록했다.
- Docker `frontend`·`backend`·`database` 3서비스와 PostgreSQL 16 health, HTTP smoke, 유지보수 점검, 백업·격리 복구, 비기능·장애복구 시험을 통과했다.
- Phase 35에서 CSRF 재동기화 안내와 API 멱등성을 구현했고, Phase 36에서 production HTTPS·OIDC·외부 저장소·악성코드 검사기 계약을 fail-closed로 강제했다.
- Phase 37에서 운영 상태·경보 판정과 백업·복구 증거를 연결했으며, 최종 백업 SHA-256은 `a2a5a81e70a4ce5ba4b29fce7ffd5c9055f4f3b64a71af8b977555382abbf804`다.
- Phase 38 로컬 시험은 60요청 p95 48.7ms·오류율 0%, DB 장애 감지 6,046ms·복구 8ms를 기록했다.
- Phase 39는 12개 전환 증거, Critical/High 결함 0, 직원·담당자·관리자 역할별 PASS와 업무·보안·운영 책임자 서명을 요구한다.
- 템플릿은 계약 검증만 통과하며 실제 production 승인을 대신할 수 없다. 실제 DNS/TLS·Secret Manager·회사 OIDC·외부 저장소/검사기·경보 채널·파일럿 UAT 서명은 외부 게이트다.
- 운영 공개 도메인은 `sqcm.safe-link.co.kr`로 결정했다. 제품화 게이트가 모두 완료된 뒤 가비아 DNS에 연결하며, 그 전에는 DNS 또는 production 연결을 실행하지 않는다.
- 운영 결정은 `docs/operations-decision-register.md`, 인수 절차는 `docs/UAT-checklist.md`와 `docs/pilot-uat-execution.md`, Phase별 증거는 `docs/phase-reports/34_*`부터 `39_*`까지에서 추적한다.

## 최근 재검증 — 2026-08-09

- 구문 검사 64개, 단위 82/82, 통합 17/17, Docker 3/3 healthy, deploy smoke와 유지보수 점검을 다시 통과했다.
- 통합 테스트의 전역 세션 개수 비교가 병렬 세션 정리와 충돌하던 비결정성을 제거하고, health·익명 응답별 `Set-Cookie` 부재를 직접 검증하도록 변경했다.
- 최근 15분 HTTP 5xx와 backend error/fatal 로그는 없었다. 중복 기준정보 삽입의 PostgreSQL UNIQUE 오류는 409 역조건 통합 테스트에서 의도적으로 발생한 기록이다.
- 저장소 내부 검증은 통과했으며 다음 진행 조건은 실제 운영 공급자 연결과 역할별 파일럿 UAT·책임자 승인이다.

## 현재 상태 — Phase 40~49 제품화 완성 체인

- 브랜치 `agent/productization-completion-chain`에서 production bootstrap·migration·Outbox·운영 공급자 계약을 보완했다.
- production은 앱 시작 자동 migration과 seed 사용자·샘플 데이터 생성을 거부한다. 별도 `db:migrate`·`db:verify` 명령을 사용한다.
- migration 015에 Outbox 재시도·lock·오류·dead-letter를 추가하고 production event publisher 계약을 필수화했다.
- 운영 manifest는 OIDC·저장소·검사기·event publisher·경보·PITR/WAL과 Secret 참조를 fail-closed로 검사한다.
- 재검증: 구문 68개, 단위 87/87, 통합 17/17, migration 15/15, Docker 3/3 healthy, smoke·유지보수 통과.
- 실제 공급자·staging·WAL/PITR·경보 수신·역할별 UAT·12개 증거·3개 승인·production 배포는 외부 실행 대기이며 최종 판정은 NO-GO다.

## 현재 상태 — Phase 70 GitHub 원격 검토 인계

- `agent/productization-completion-chain`을 원격에 push하고 `main` 대상 draft PR #10을 생성했다.
- PR URL은 `https://github.com/visionlab-coder/sqcm-i-inventory-system/pull/10`이다.
- GitHub Actions `unit`과 `three-tier-integration`이 모두 PASS했다.
- 저장소 협업자는 `visionlab-coder`만 확인되어 `Frosty city man` reviewer 지정은 정확한 GitHub username 확인 전까지 보류한다.
- Phase 69 AI 브리지 STOP과 Production NO-GO 판정은 유지한다.

## 현재 상태 — Phase 71~72 AI PC 브리지 계약·인프라 설계 (2026-08-15)

- `agent docs/prompts/71_Phase71_AI_PC_브리지_계약_운영게이트_메타프롬프트.md`와 Phase 72 인프라 설계 메타프롬프트가 prompt contract strict 8/8을 통과했다.
- 외부 AI 계약은 `/health`, `/ready`, `/recommend`, `/ocr` 네 endpoint, 조직 범위, HTTPS, secret reference, timeout, rules fallback을 기준으로 고정했다.
- `npm run check`는 구문 90개·단위 105/105, `npm run ui:contract`는 13개를 통과했다. `npm run ai:preflight`는 `AI_PROVIDER_DRIVER=rules`라서 외부 호출 없이 skipped다.
- `develop docs/31_사무실_AI_PC_인프라_설계.md`에 AI PC 토폴로지·방화벽·TLS/mTLS·Windows 서비스·관찰성·롤백·전환 게이트를 기록했다. 기존 LM Studio 1234와 SONOL BOT/18765는 보존하며 신규 18766은 후보일 뿐이다.
- 실제 독립 runtime·모델 checksum·listener·health/ready·TLS·인증·방화벽·UAT 증거가 없으므로 외부 AI 활성화와 Production GO는 `HOLD`다. 다음 READY는 AI PC 운영자의 G1~G3 증거 제출이다.

## 현재 상태 — Phase 73 완성도 정합화 (2026-08-15)

- 새 전역지침에 맞춘 활성 계약은 `agent docs/prompts/73_완성도_정합화_실행_메타프롬프트.md`, 현재 상태 단일 정본은 `docs/current-state.md`다. 과거 Phase 수치와 프롬프트는 역사 증거로만 보존한다.
- Docker는 `frontend`·`backend`·`database` 정확히 3서비스이며 자동화 scheduler는 backend 내부에서 실행된다. Compose 계약 검사가 3/3을 강제한다.
- 로컬 `.env`는 PowerShell 생성기가 난수 비밀을 만들며 CI도 매 실행마다 임시 자격증명을 생성한다. 저장소 고정 자격증명·Mock 제작 문구·Mock PNG 제작 청크는 자동 검사 0건이다.
- 최신 검증은 구문 91개, 단위 105/105, 통합 20/20, UI 계약 13, migration 22/22, Docker 3/3 healthy, 비기능 60요청 오류율 0%·p95 20.6ms, 장애 감지 6,078ms·복구 17ms, 운영 의존성 취약점 0건이다.
- 인앱 브라우저의 localhost URL 정책이 자동조작을 차단해 별도 시각 클릭 증거는 만들지 못했다. 대신 실제 프록시 health/readiness/익명 401/공식 반전 로고 HTTP smoke와 UI 계약을 통과했다.
- 외부 8개 운영 결정, UAT 19항목·3개 책임자 서명, 실제 공급자 manifest·cutover evidence, AI PC G1~G5, DNS/TLS·PITR·production 배포는 미완료다. Production과 외부 AI는 `NO-GO/HOLD`다.
# 현재 상태 — Phase 74 불변 이미지 릴리스 게이트 (2026-08-15)

- production 배포는 정확한 `sha-<40자리 Git SHA>`와 서로 다른 공식 GHCR frontend/backend 저장소만 허용하도록 fail-closed 계약을 추가했다.
- main push 시 두 앱 이미지를 build·push하고 provenance를 남기는 workflow를 추가했으며 모든 외부 Action 참조를 commit SHA로 고정했다.
- 외부 배포는 서버 build 대신 검증 이미지 pull 후 `frontend/backend/database` 3서비스를 기동한다.
- 로컬 증거는 구문 93개, 단위 107/107, Compose 계약, 저장소 위생, YAML·PowerShell parser, diff PASS다.
- 다음 READY는 PR CI → main 병합 → GHCR digest 확인이다. 실제 production은 운영 호스트·Secret·DNS/TLS·UAT·AI PC 증거가 없어 NO-GO를 유지한다.

# 현재 상태 — Phase 75 외부 게이트 실행 계약 (2026-08-15)

- 애플리케이션 릴리스 기준 SHA `c51cc7377d52b569de0c934a09e0a8479f74f702`와 prerelease `v1.0.0-rc.1`, frontend/backend GHCR digest·provenance가 검증됐다.
- 남은 정본은 GitHub 이슈 #12 운영, #13 UAT, #14 AI PC, #15 Frosty 계정이며 Phase 75 메타프롬프트가 실행 순서와 완료·중단 기준을 소유한다.
- `sqcm.safe-link.co.kr`은 기존 SQCM-i OS가 사용 중이고 AI PC listener와 실제 UAT 행위자가 없으므로 production은 승인된 보류다.
- 다음 READY는 #15 username, #14 AI PC 입력, #12 운영 대상, #13 UAT 참여자 중 실제 입력이 확인된 이슈 한 건이다.
