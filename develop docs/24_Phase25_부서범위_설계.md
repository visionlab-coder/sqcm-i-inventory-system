# Phase 25 FR-007 부서 데이터 범위 설계

## 정책

- `ALL`: 모든 조직을 다루는 시스템 관리자 범위
- `ORGANIZATION`: 자신의 조직 전체
- `DEPARTMENT`: 기준 부서와 활성 하위 부서
- `SELF`: 자신의 요청·배정 중심, 자산은 연결된 자신의 부서 범위
- 범위가 없던 기존 계정은 ADMIN=ALL, MANAGER=ORGANIZATION, USER=DEPARTMENT로 migration 010에서 명시한다.

## 적용 경계

세션 사용자 → 역할 권한 → role scope 조회 → 재귀 부서 ID → Repository SQL WHERE/Service 연결 검증 → 응답.

## 체크리스트

- [x] migration 010 기존 사용자 범위 backfill
- [x] 재귀 부서 Scope Service
- [x] 세션 응답 범위 표시
- [x] 자산 목록·상세·생성·변경 강제
- [x] 요청 목록·생성·검토 강제
- [x] 보고서·CSV 동일 범위 강제
- [x] 파일·수리·재물조사 우회 경로 범위 강제
- [x] 관리자 범위 조회·변경 API와 감사 트랜잭션
- [x] 단위·다부서 HTTP/DB 역조건
- [x] 로그인 화면 브라우저·공식 로고 확인(인증 후 범위 화면은 HTTP 인수로 대체)
