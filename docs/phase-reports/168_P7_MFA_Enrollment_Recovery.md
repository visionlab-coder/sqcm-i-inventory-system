# P7 MFA 최초 등록·로그인 복구

기준일: 2026-09-13  
상태: `PASS_PRODUCTION_MFA_ENROLLMENT_RECOVERY`  
배포 코드 SHA: `5ab7b9928fa7ecc3b04fcf66370e4cc9daee86bd`

## 1. 재현과 원인

- Production 로그인 로그에서 반복된 `401/403`을 확인했다.
- 승인된 master 2계정은 `ACTIVE`, `ADMIN`, 미잠금 상태였으나 MFA credential이 없었다.
- 기존 흐름은 MFA 등록이 필요한 사용자에게 세션을 발급하지 않았고, MFA setup API는 인증 세션을 요구했다.
- 결과적으로 사용자가 MFA를 등록할 화면과 권한에 도달할 수 없는 인증 상태 전이 교착이었다.

## 2. 수정 계약

- 올바른 비밀번호가 확인된 MFA 미등록 사용자에게만 5분 제한 등록 세션을 발급한다.
- 제한 세션에는 업무 사용자 세션을 넣지 않으며 `/api/auth/me`와 업무 API는 계속 `401`로 차단한다.
- TOTP 등록·검증이 성공한 뒤 세션을 재생성하고 정상 인증 세션을 발급한다.
- MFA 비활성화, 우회 로그인, 비밀번호 초기화나 계정 잠금 해제는 수행하지 않았다.
- 비밀번호·OTP·MFA Secret·recovery code 원문을 증거에 기록하지 않았다.

## 3. 변경 체크리스트

- [x] Backend 최초 MFA 등록 상태 전이와 fail-closed API 추가
- [x] Frontend 인증 앱 등록·6자리 코드 확인·복구 코드 보관 화면 추가
- [x] 새 frontend cache revision 적용
- [x] MFA 등록 통합시험 및 UI 계약 추가
- [x] exact allowlist commit·push
- [x] GitHub-hosted quality CI 성공
- [x] immutable SHA 이미지 빌드와 Production 3서비스 배포
- [x] DB 무교체·무 migration 확인
- [x] 공개 Inventory와 기존 SQCM-i tunnel 보존 확인
- [ ] 실제 사용자의 인증 앱 등록과 로그인 완료

## 4. 검증 증거

- `node --check src/app.js`: PASS
- `node --check frontend/app.js`: PASS
- `npm.cmd run check`: 1038 tests, 1030 PASS, 8 SKIP, 0 FAIL
- `npm.cmd run ui:contract`: 47 PASS
- 격리 MFA 흐름: login `202` → pending `/api/auth/me` `401` → pending 업무 API `401` → setup `200` → enable `200` → `/api/auth/me` `200` → logout `204`
- GitHub Actions quality run `34733776078`: `completed/success`, exact SHA 일치
- Production frontend/backend image revision: exact SHA 일치, 모두 healthy
- Production database: 기존 container `21cd02e609ac...` 유지, healthy, host port 미공개
- Tunnel watchdog: Inventory connections 4, protected SQCM-i connections 4, origin `200`, Inventory `200`, SQCM-i OS `200`, SAFE-LINK root 정상 redirect `301`

## 5. 사용자 확인 절차

1. `https://inventory.safe-link.co.kr/?v=20260913-mfa-enrollment`에 접속한다.
2. 회사 이메일과 현재 비밀번호로 로그인한다.
3. 최초 등록 화면의 키를 Microsoft Authenticator 또는 Google Authenticator에 추가한다.
4. 인증 앱의 6자리 코드를 입력해 등록한다.
5. 한 번만 표시되는 복구 코드를 안전한 개인 보관소에 저장한 뒤 계속한다.

## 6. 남은 Gate

- master 2계정의 실제 MFA 등록은 사용자의 인증 앱 소유 증거가 필요하므로 자동 완료하지 않는다.
- 본 장애 복구는 P7 운영 인수 전체 완료를 의미하지 않는다. Harness 정본은 `7/8`, READY `P7-G1-OPERATIONS-ACTIVATION-AND-SIGNOFF`를 유지한다.
