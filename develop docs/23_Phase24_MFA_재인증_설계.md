# Phase 24 FR-006/008 MFA·재인증 설계

## 결정

- MFA 1차 방식은 표준 TOTP 6자리·30초이며 ±1 구간만 허용한다.
- 비밀은 AES-256-GCM으로 암호화하고 production은 별도 base64 32-byte 키를 요구한다.
- 복구코드는 8개를 한 번만 표시하고 SHA-256 해시만 저장하며 사용 즉시 제거한다.
- 비밀번호 성공 후 MFA 사용자는 인증 세션이 아니라 5분짜리 pending challenge만 가진다.
- 같은 TOTP counter 재사용을 차단한다.

## 데이터 흐름

비밀번호 검증 → pending MFA 세션·CSRF → TOTP/복구코드 검증 → 세션 ID 재회전 → userId·mfaVerifiedAt 저장 → 감사 → Browser.

## 체크리스트

- [x] migration 009와 암호화 키 설정
- [x] setup/enable/verify/disable Service
- [x] MFA 전 로그인 세션 차단과 challenge 만료
- [x] 관리자 민감 쓰기 재인증+MFA 조건
- [x] 보안 설정·로그인 MFA UI
- [x] 정상·오류·재사용·복구코드 단위 테스트
- [x] HTTP/DB·감사·브라우저 인수
