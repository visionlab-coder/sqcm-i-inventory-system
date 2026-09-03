# P7 회사 마스터 계정 Production 활성화

기준일: 2026-09-03  
결과: **PASS — 마스터 2/2 활성화**

## 체크리스트

- [x] 사용자 지정 계정 2건만 정확한 allowlist로 처리
- [x] `mb.kim@seowonenc.co.kr`을 Production 마스터로 생성
- [x] `visionlab@seowonenc.co.kr`을 Production 마스터로 생성
- [x] 제품 최고 권한 `ADMIN`, 시스템 관리자, 전체 범위 `ALL` 적용
- [x] 초기 비밀번호 원문 비저장·비출력 및 bcrypt cost 12 적용
- [x] 최초 로그인 후 비밀번호 변경 전 업무 API 차단
- [x] 비밀번호 변경 후 관리자 MFA 등록 강제
- [x] 기존 세션과 MFA 자격정보 폐기 계약 적용
- [x] `MASTER_ACCOUNT_PROVISIONED` 감사 이벤트 2건 기록
- [x] 공개 HTTPS에서 두 계정의 초기 로그인 경계 확인
- [x] 배포 전 PostgreSQL 백업 및 격리 복구훈련 통과
- [x] Docker 3서비스와 보호 포트·PID 보존

## 실행 결과

두 계정 모두 `ADMIN / ACTIVE / is_system_admin=true / scope=ALL` 상태다. 초기 로그인 시 `passwordResetRequired=true`이며 비밀번호를 바꾸기 전 `/api/dashboard`는 HTTP 403 `PASSWORD_CHANGE_REQUIRED`로 차단됐다. 검증 후 두 세션은 모두 로그아웃되어 활성 세션은 0건이다.

사용자가 직접 초기 비밀번호를 변경하면 관리자 MFA 등록이 다음 필수 단계가 된다. 자동화는 사용자의 최종 비밀번호나 MFA Secret을 대신 생성하거나 기록하지 않았다.

## 실패 교정

첫 실행기는 PostgreSQL 세션 저장소에 존재하지 않는 `user_sessions.user_id`를 참조해 실패했다. 모든 실패 트랜잭션은 롤백됐다. 실제 `connect-pg-simple` 구조인 JSON `sess.userId`와 `sess.pendingMfaUserId`를 기준으로 세션 폐기 로직을 수정하고 회귀시험 3/3을 통과한 뒤 재실행했다.

## 검증 증거

- 마스터 프로비저닝: `requested=2`, `inserted=2`, `updated=0`
- 공개 초기 로그인: 2/2 HTTP 200
- 권한 응답: 2/2 `ADMIN`, `isSystemAdmin=true`
- 변경 전 업무 차단: 2/2 HTTP 403 `PASSWORD_CHANGE_REQUIRED`
- 검증 로그아웃: 2/2 HTTP 204, 잔존 세션 0
- 감사 이벤트: 2건
- 격리 복구훈련: 33개 필수 테이블, 25개 migration 및 주요 행 수 일치
- 보호 listener: 1234/6632, 11434/8588, 18765/22716, 18766/65724 보존

기계 증거: `agent docs/harness/P7_COMPANY_MASTER_PRODUCTION_EVIDENCE.json`
