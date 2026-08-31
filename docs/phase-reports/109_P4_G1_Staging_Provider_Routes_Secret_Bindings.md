# P4-G1 Staging Provider Routes·Secret Bindings 결과

기준일: 2026-08-31

결과: **부분 완료 / DNS fail-closed / 동일 READY 유지**

## 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| Supabase private bucket | [x] | `sqcm-i-inventory-staging`, public=false |
| 파일 제한 | [x] | 5 MiB, JPEG·PNG·PDF |
| S3 server credential | [x] | protected ignored env, 원문 미기록 |
| S3 write/read/delete | [x] | hash PASS, probe object Removed |
| OAuth server | [x] | enabled, dynamic registration=false |
| 비대칭 서명 | [x] | current ES256 P-256 |
| confidential client | [x] | exact staging callback, manual registration |
| OIDC discovery·PKCE | [x] | discovery PASS, S256 adapter contract |
| provider adapters | [x] | S3·OIDC·HTTPS event 구현, focused 9/9 |
| event receipt | [x] | bearer 401 역조건, 202 stable receipt |
| staging Nginx route | [x] 구성 | `nginx -t` PASS, 미배포 |
| consent UI | [x] 로컬 구현 | 공식 OAuth API·memory-only session·접근성 계약 PASS, live flow 미실행 |
| 사용자 provisioning | [x] | ADMIN·MANAGER·USER 3계정 자동 확인, 메일 0건, identity link 3건 |
| Cloudflare DNS/TLS | [ ] 안전 보류 | seed synthetic stack 공개 방지 |

## 사전검토 판정

`ALLOW_WITH_CONDITIONS`다. Storage access key는 서버 전용이며 현재 전용 project에 bucket이 하나뿐이다. Supabase OAuth server는 beta이고 OIDC ID token에 ES256을 사용한다. dynamic registration은 비활성화했다. Secret은 `.env.staging.local`에만 저장했고 Git ignore 및 current user·SYSTEM ACL을 유지했다.

## 변경과 검증

- `@aws-sdk/client-s3@3.1121.0`, `jose@6.2.10` exact dependency 추가
- Supabase S3 file store, OIDC confidential client, HTTPS event publisher adapter 구현
- OIDC start/callback에 PKCE verifier·challenge 연결
- bridge에 bearer-protected idempotent event receipt 추가
- staging 전용 Nginx provider route 계약 추가
- focused 9/9, 전체 unit 139/139, syntax 115, Compose 3서비스, Nginx syntax PASS

## DNS를 게시하지 않은 이유

현재 `compose.staging-synthetic.yaml`은 로컬 검증용 seed 사용자를 포함한다. Supabase Auth 사용자 provisioning·identity linking과 `/oauth/consent` 로컬 UI는 완료됐지만 non-seed staging 배포와 실제 authorization flow 증거가 없다. 이 상태에서 DNS와 connector를 켜면 seed 로그인이 인터넷에 노출될 수 있으므로 승인된 DNS 작업을 안전 역조건 충족 시점까지 fail-closed로 보류했다.

## UAT Auth·Identity 보완

- staging 애플리케이션 DB가 사용자 0건이어서 승인된 UAT 3역할에 필요한 사용자·역할 범위를 최소 생성했다.
- Supabase Auth ADMIN·MANAGER·USER 3계정을 자동 확인으로 생성했고 확인 메일은 발송하지 않았다.
- 랜덤 Auth 비밀번호는 Git ignored·현재 사용자/SYSTEM ACL의 `.env.staging.local`에만 저장했다.
- 비밀번호 로그인은 3/3 HTTP 200, 검증 세션 로그아웃은 3/3 HTTP 204였다.
- issuer·subject identity link 3건, 고유 subject 3개, 역할 범위 `ALL`·`ORGANIZATION`·`DEPARTMENT`를 확인했다.

## 다음 READY

`P4-G1-STAGING-PROVIDER-ROUTES-AND-SECRET-REFERENCES`를 유지한다. 다음 Loop는 non-seed staging deployment를 만든 뒤 consent/provider HTTPS probes와 DNS/TLS를 활성화한다.
