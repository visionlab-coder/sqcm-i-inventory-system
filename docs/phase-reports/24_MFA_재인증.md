# Phase 24 FR-006/008 MFA·재인증 보고서

상태: 완료

## 구현

- TOTP 6자리·30초·±1 구간, 동일 counter 재사용 차단
- AES-256-GCM 비밀 암호화와 production base64 32-byte 키 강제
- 해시 저장·단회 사용 복구코드 8개
- 비밀번호 성공 후 5분 pending challenge, MFA 성공 뒤 세션 재회전
- setup/enable/verify/disable API와 모든 사용자용 보안 설정 화면
- MFA 사용자의 legacy HTML 로그인 우회 차단
- 관리자 민감 쓰기는 최근 비밀번호 재인증과 최근 MFA를 함께 요구
- 관리자가 `mfa_enabled` 값을 임의 변경하지 못하고 사용자 본인 등록 절차만 허용

## 데이터 왕복

Browser → 비밀번호 검증 → pending MFA session/CSRF → TOTP Service → 암호화 credential Repository → PostgreSQL counter/복구코드 원자 갱신·감사 → session 재회전 → Browser.

## 검증

| 항목 | 결과 |
|---|---|
| 구문·단위 | JavaScript 40개, 52/52 통과 |
| 통합 | HTTP/DB 13/13, 실패·skip 0 |
| 보안 역조건 | 잘못된 코드 401, 같은 counter·복구코드 재사용 거부, 인증 전 user 미발급 |
| 저장 | 비밀 원문·복구코드 원문 DB 비노출 |
| 감사 | setup·enable·challenge·성공·실패 기록, OTP/비밀 원문 없음 |
| 브라우저 | desktop·375px MFA 로그인, 공식 반전 로고, body=viewport, 콘솔 경고·오류 0 |
| 정리 | 시드 관리자 임시 credential 1건·최근 MFA 감사 4건만 검증 후 원상복구, `false|0|0` |

## 다음 체인

Phase 25에서 MFA로 보호된 관리자 경계를 전제로 FR-007 부서 데이터 범위를 모든 조회·쓰기에 강제한다.
