# 운영 결정표

상태 기준: 미결정 / 준비 / 승인 / 검증

| 결정 | 현재 상태 | 결정자 | 필수 입력 | 저장소 준비 증거 | 운영 완료 조건 |
|---|---|---|---|---|---|
| OIDC 공급자·tenant | 미결정 | 보안/IT 관리자 | issuer, client, redirect URI, claim 정책 | adapter contract, state·nonce, identity migration | staging 실제 로그인·로그아웃·MFA 통과 |
| 객체 저장소 | 미결정 | 인프라 관리자 | endpoint, bucket, identity, 보존·암호화 | byte store contract, checksum, 보상 삭제 | 업로드·다운로드·권한·수명주기 통과 |
| 악성코드 검사 | 미결정 | 보안 관리자 | endpoint, timeout, 판정·격리 정책 | clean-only contract, fail-closed | 정상·감염·unknown·timeout 통과 |
| 운영 URL·TLS·DNS | 미결정 | 인프라 관리자 | hostname, 인증서, 프록시 | secure cookie·redirect precheck | 외부 health·핵심 smoke 통과 |
| 백업 저장·보존 | 미결정 | DB/보안 관리자 | 암호화 저장소, RPO/RTO, 보존기간 | 격리 복구 스크립트 | 승인 백업에서 복구훈련 서명 |
| 실사용자 UAT | 미결정 | 업무 책임자 | 직원·담당자·관리자 표본 | UAT 시나리오 | 결함 처리 후 승인 서명 |

실제 공급자 계정과 외부 인프라는 사용자 승인 없이 생성하지 않는다.
