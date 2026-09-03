# P7 서원토건 회사 이메일 최초 로그인 Production 반영

기준일: 2026-09-03  
결과: **PASS — Production 사용 가능**

## 체크리스트

- [x] 승인된 사내 명단을 정본으로 사용하고 임의 도메인 가입은 허용하지 않음
- [x] 활성 `@seowonenc.co.kr` 계정 9건을 `USER` 역할로 생성
- [x] 기존 계정의 비밀번호·역할·상태는 변경하지 않는 보존 계약 적용
- [x] 초기 비밀번호는 bcrypt cost 12로 해시하고 원문을 파일·로그·Git에 기록하지 않음
- [x] 최초 로그인 직후 비밀번호 변경 전에는 업무 API를 `PASSWORD_CHANGE_REQUIRED`로 차단
- [x] 새 비밀번호는 12자 이상, 영문 대·소문자·숫자·특수문자 조합 및 초기 비밀번호 재사용 금지
- [x] 변경 성공 시 기존 세션 폐기·현재 세션 회전·`INITIAL_PASSWORD_CHANGED` 감사 이벤트 기록
- [x] Production 배포 전 논리 백업 및 격리 복구훈련 통과
- [x] 새 불변 이미지 배포 후 공개 HTTPS health와 실제 초기 로그인 경계 통과
- [x] Docker 3서비스, 비공개 backend/database, 보호 포트·PID 보존
- [ ] 직원별 최종 비밀번호 설정 — 각 직원이 최초 로그인 후 직접 수행

## Production 결과

배포 기준 SHA는 `38b2bca7f34a7a950469c8d0cd6d2a4b11e3b7a6`이다. Backend와 frontend 모두 이 SHA의 GHCR 불변 이미지로 실행되며, `https://inventory.safe-link.co.kr/api/health`는 HTTP 200과 database `up`을 반환했다.

승인된 명단의 활성 회사 이메일은 9건이었다. 실행 결과는 `requested=9`, `inserted=9`, `preserved=0`, `passwordResetRequired=9`이다. 계정·이름·비밀번호 원문은 이 보고서와 기계 증거에 포함하지 않았다.

실제 회사 계정 1건으로 공개 HTTPS 최초 로그인을 검증했다. 로그인은 HTTP 200, `passwordResetRequired=true`, 변경 전 업무 API는 HTTP 403 `PASSWORD_CHANGE_REQUIRED`, 로그아웃은 HTTP 204였다. 직원의 최종 비밀번호는 자동화가 대신 정하지 않았다.

## 백업과 복구

배포·계정 생성 전 `418,109 bytes` PostgreSQL custom-format 백업을 만들고 SHA-256을 기록했다. 별도 임시 DB로 복원해 33개 필수 테이블, 25개 migration 및 주요 테이블 행 수가 원본과 일치함을 확인한 뒤 임시 DB를 제거했다. 백업 파일은 Git 제외 경로인 `artifacts/backups`에 보관한다.

## 검증 증거

- `npm.cmd run check` → 910 PASS, 0 FAIL, 8 SKIP
- `npm.cmd run ui:contract` → 22/22 PASS
- GitHub PR #24 required checks → unit PASS, three-tier-integration PASS
- GitHub `quality`와 `release-images` → main SHA 기준 PASS
- Production Compose → `frontend`, `backend`, `database` 3/3 healthy
- 공개 HTTPS 초기 로그인 경계 → PASS
- 보호 listener → 1234/6632, 11434/8588, 18765/22716, 18766/65724 보존

기계 증거: `agent docs/harness/P7_COMPANY_EMAIL_FIRST_LOGIN_PRODUCTION_EVIDENCE.json`

## 직원 사용 절차

1. `https://inventory.safe-link.co.kr`에 접속한다.
2. 본인의 서원토건 회사 이메일과 안내받은 초기 비밀번호로 로그인한다.
3. 표시되는 비밀번호 변경 화면에서 현재 비밀번호와 본인만 아는 새 비밀번호를 입력한다.
4. 변경이 완료되면 비품관리 업무 화면을 사용한다.

초기 비밀번호를 변경하기 전에는 비품 조회·등록·대여 등 업무 API를 사용할 수 없다.
