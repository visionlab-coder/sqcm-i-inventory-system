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
- 운영 결정은 `docs/operations-decision-register.md`, 인수 절차는 `docs/UAT-checklist.md`와 `docs/pilot-uat-execution.md`, Phase별 증거는 `docs/phase-reports/34_*`부터 `39_*`까지에서 추적한다.

## 최근 재검증 — 2026-08-09

- 구문 검사 64개, 단위 82/82, 통합 17/17, Docker 3/3 healthy, deploy smoke와 유지보수 점검을 다시 통과했다.
- 통합 테스트의 전역 세션 개수 비교가 병렬 세션 정리와 충돌하던 비결정성을 제거하고, health·익명 응답별 `Set-Cookie` 부재를 직접 검증하도록 변경했다.
- 최근 15분 HTTP 5xx와 backend error/fatal 로그는 없었다. 중복 기준정보 삽입의 PostgreSQL UNIQUE 오류는 409 역조건 통합 테스트에서 의도적으로 발생한 기록이다.
- 저장소 내부 검증은 통과했으며 다음 진행 조건은 실제 운영 공급자 연결과 역할별 파일럿 UAT·책임자 승인이다.
