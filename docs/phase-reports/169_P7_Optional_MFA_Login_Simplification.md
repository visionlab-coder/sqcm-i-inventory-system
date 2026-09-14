# P7 선택형 MFA 로그인 간소화 보고서

기준일: 2026-09-14 KST
상태: **Production 적용 및 운영 검증 PASS / P7 전체 7/8 유지**

## 1. 목표와 사용자 변화

- [x] 최초 로그인 때 TOTP 앱 등록을 강제하지 않는다.
- [x] MFA 미등록 사용자는 회사 이메일과 현재 비밀번호로 바로 로그인한다.
- [x] 보안 설정의 선택형 TOTP MFA 등록 기능은 유지한다.
- [x] 이미 MFA를 활성화한 계정에는 기존 TOTP 검증을 계속 적용한다.

## 2. 보안 불변식

- [x] 비밀번호 원문을 저장·출력하지 않고 기존 해시 검증을 유지한다.
- [x] CSRF 및 same-origin 보호를 유지한다.
- [x] secure session cookie와 로그인 rate limit을 유지한다.
- [x] 조직·부서·역할 기반 RBAC를 유지한다.
- [x] 선택형 MFA 해제는 기존 비밀번호·TOTP 재인증 계약을 유지한다.

## 3. 코드·배포 계약

- [x] `PRODUCTION_LOCAL_AUTH_MFA_REQUIRED=false`를 승인된 Production 런타임에만 적용했다.
- [x] 운영 adapter와 loopback publisher는 MFA 의무 플래그와 분리하되 Production·PostgreSQL·local auth·loopback 제약을 유지했다.
- [x] 검증된 로컬 Production 이미지는 exact repository 2개와 `sha-<40 hex>` 태그만 허용한다.
- [x] GHCR push 권한 오류 뒤 같은 경로를 반복하지 않고 검증된 로컬 불변 이미지 경로로 전환했다.

## 4. 검증 증거

- [x] 집중 release contract: 3 PASS, 0 FAIL.
- [x] 전체 unit: 1,039건 중 1,031 PASS, 8 SKIP, 0 FAIL.
- [x] UI contract: 47 PASS, 0 FAIL.
- [x] 격리 Docker 3서비스 실제 ADMIN 로그인: MFA 미등록 상태에서 login·session·RBAC·logout·audit PASS.
- [x] GitHub quality run `34796291677`: SHA `189edd749f8d40cdce03e6cc1938c2d1fe35979d`, SUCCESS.
- [x] 공개 URL HTTP 200 및 브라우저에서 이메일·비밀번호 로그인 화면 확인.

## 5. Production 적용 결과

- [x] backend/frontend revision: `189edd749f8d40cdce03e6cc1938c2d1fe35979d`.
- [x] backend/frontend/database 정확히 3서비스 healthy.
- [x] backend/database host published port 0, frontend `127.0.0.1:3300`만 공개.
- [x] database 컨테이너 `21cd02e609acdceed47e0aa84aefdcc37149c4b2a6c1998a3ac9d49e93f64a65` 보존.
- [x] Inventory Tunnel 연결 4, 보호 SQCM-i Tunnel 연결 4 보존.
- [x] `inventory.safe-link.co.kr` 200, `sqcm.safe-link.co.kr/os` 200, `safe-link.co.kr` 301.
- [x] 최근 backend fatal/5xx 일치 로그 0건.

## 6. 복구 지점

- [x] 기존 실행 revision `5ab7b9928fa7ecc3b04fcf66370e4cc9daee86bd`를 확인했다.
- [x] 변경 commit `d9121ea681c72a6945b74e214f3b93d370c461f2`와 배포 계약 commit `189edd749f8d40cdce03e6cc1938c2d1fe35979d`를 private remote 동일 branch에 push했다.
- [x] 데이터 migration, DB 재생성, SQCM-i Cloudflared 서비스 교체·재시작은 수행하지 않았다.

## 7. 남은 Gate

- [ ] 실제 직원 자격증명 입력은 에이전트가 추측하거나 저장하지 않는다. 사용자가 현재 비밀번호로 로그인해 직접 사용 확인한다.
- [ ] 이미 MFA를 활성화한 계정은 선택형 MFA 해제 전까지 기존 TOTP가 필요하다.
- [ ] P7 운영 인수 SLO·경보·백업복원·온콜 증거는 별도 READY이므로 전체 Phase는 7/8이다.

공개 로그인: <https://inventory.safe-link.co.kr/?v=20260914-password-login>
