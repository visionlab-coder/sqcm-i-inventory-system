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

## 현재 상태 — Phase 30~33 후속 운영 준비

- 기업형 기능 FR 35/35와 Phase 24~29 체인 완료, 실제 운영 공급자·배포·UAT 승인만 외부 게이트로 분리
- migration 13개·필수 테이블 31개, 단위 65/65, 통합 16/16, Docker 3/3, readiness·smoke·최종 격리 복구 통과
- Docker frontend/backend/database 3서비스와 PostgreSQL 16 healthy
- 최종 백업 SHA-256 `f2d18ac60f04d64e1932571178d7a07302d26cac1c1a0fc01e4902fbbea7cb9c`; health 세션 생성과 업무 테스트 잔존 0, 외부 결정은 `docs/operations-decision-register.md`, 인수는 `docs/UAT-checklist.md`에서 추적
- Phase 30 후속 체인과 4개 메타프롬프트 작성, Phase 31 Node 24 Actions 전환, Phase 32 운영 manifest·live probe, Phase 33 9개 증거·3개 승인 전환 게이트 구현
- 템플릿은 계약 검증만 통과하며 실제 production 승인으로 사용할 수 없다. 실제 공급자·DNS/TLS·Secret·UAT 서명과 GitHub 대상 계정 식별은 외부 게이트다.
