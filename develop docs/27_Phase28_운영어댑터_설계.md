# Phase 28 운영 어댑터·인수 설계

## 목표

실제 공급자를 임의 선정하지 않고 OIDC, 객체 저장소, 악성코드 검사에 필요한 공급자 독립 계약을 정의한다. production은 세 계약과 필수 설정이 없으면 기동하지 않는다.

## 런타임 계약

`OPERATIONAL_ADAPTER_MODULE`은 `createOperationalAdapters(config)`를 export하고 다음 객체를 반환한다.

| 객체 | 필수 메서드 | 반환 계약 |
|---|---|---|
| `oidcProvider` | `authorizationUrl`, `exchangeCode`, `healthCheck` | 검증된 issuer·subject·email·emailVerified, readiness |
| `fileStore` | `write`, `read`, `removeNew`, `healthCheck` | 바이트 저장·조회·보상 삭제, readiness |
| `malwareScanner` | `scan`, `healthCheck` | `{status:'clean'}`만 저장 허용, readiness |

production에서 LOCAL 저장소나 MOCK 스캐너는 계약 검사를 통과할 수 없다. 공급자 장애·검사 오류·unknown 결과는 업로드 실패로 처리한다.

## SSO 흐름

Browser → OIDC start → state·nonce 세션 저장 → IdP → callback → state·nonce·claims 검증 → 사전 연결 identity 조회 → 세션 회전 → 선택적 MFA → 감사 → 허용 화면 순서다. 이메일 최초 연결은 `OIDC_ALLOW_EMAIL_LINKING=true`인 경우에만 검증된 이메일로 허용하며 기본값은 false다.

## Secret·설정 목록

- 공통: `POSTGRES_PASSWORD`, `SESSION_SECRET`, `MFA_ENCRYPTION_KEY`
- 운영 계약: `AUTH_PROVIDER=oidc`, `FILE_STORAGE_DRIVER=external`, `MALWARE_SCAN_DRIVER=external`, `OPERATIONAL_ADAPTER_MODULE`
- OIDC: `OIDC_REDIRECT_URI`, 공급자 모듈이 요구하는 client id/secret·issuer·JWKS 설정
- 저장소·검사기: 공급자 모듈이 요구하는 endpoint·bucket·접근키 또는 workload identity·scanner endpoint/credential

Secret 값은 저장소, 이미지, 로그, UAT 문서에 기록하지 않는다. 배포 플랫폼 Secret 저장소에서 런타임으로 주입한다.

## 환경과 책임 경계

- local: local 저장소 + mock 검사 + local 로그인
- staging: 대체 어댑터 계약 테스트 후 승인된 시험 공급자 연결
- production: 실제 IdP·객체 저장소·검사기와 Secret이 모두 준비된 경우만 기동
- 저장소 책임: 계약, fail-closed, precheck, readiness, UAT 절차
- 운영 책임: 공급자 선정·계정·DNS/TLS·Secret 주입·실사용자 승인
