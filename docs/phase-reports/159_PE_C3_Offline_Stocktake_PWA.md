# PE-C3 오프라인 재물조사 PWA 체크리스트

기준일: 2026-09-04 KST

상태: **기능·검증 완료 / Git 완료 체크포인트 생성 중**

다음 READY: `PE-C4-EMPLOYEE-SELF-SERVICE`

## 1. 사용자 가치

- [x] 통신이 끊긴 현장에서도 불러온 조사 원장과 입력 결과를 현재 기기에 보관한다.
- [x] 재연결 뒤 한 번의 동기화로 서버 원장에 반영한다.
- [x] 충돌·대기 건수를 숨기지 않고 사용자가 확인할 수 있다.

## 2. 기능

- [x] PWA manifest·service worker와 정적 shell cache
- [x] 조사 snapshot과 쓰기 operation을 분리한 IndexedDB
- [x] 동일 자산의 미전송 입력은 마지막 현장 판단 한 건으로 병합
- [x] UUID operation ID, payload SHA-256, transaction advisory lock과 receipt 기반 동시·순차 중복 전송 방지

## 3. 보안·무결성

- [x] service worker가 `/api/`와 인증 응답을 캐시하지 않는다.
- [x] CSRF·로그인·조직·부서 권한을 기존 API와 동일하게 적용한다.
- [x] 기준 version 불일치·다른 조사/자산의 operation ID 재사용·확정 조사 변경을 fail-closed한다.
- [x] 미동기화 작업이 있거나 오프라인이면 조사 확정을 차단한다.

## 4. 화면·접근성

- [x] 온라인·오프라인·대기 수·충돌 상태를 텍스트로 표시한다.
- [x] 자산별 select에 접근 가능한 이름을 제공한다.
- [x] 1440×900과 390×844에서 가로 넘침 0, 오프라인 확정 차단을 확인했다.

## 5. 데이터·운영

- [x] application migration 028 적용, 전체 27/27
- [x] 서버 결과 version 증가와 고유 operation receipt 기록
- [x] 성공·중복만 로컬 큐에서 제거하고 충돌은 보존
- [x] 합성 사용자·자산·조사·세션·감사·receipt exact cleanup
- [x] 중단된 과거 통합시험의 비기본 합성 승인정책 1건을 exact identity·참조 0건 확인 뒤 정리

## 6. 검증 증거

- [x] 전체 check: 938 PASS / 8 SKIP / 0 FAIL
- [x] UI 계약: 38/38 PASS
- [x] 전체 PostgreSQL 통합: 24 PASS / 1 실제 Defender SKIP / 0 FAIL
- [x] 브라우저 오프라인 큐 1건 → 재연결 동기화 1건 → DB `DAMAGED`, version 1, receipt 1, audit 1
- [x] 데스크톱 SHA-256 `2d92b0fca5334e6bbbcc57e33ad28b6fec6045795c423853513c6a0c89224e4a`
- [x] 모바일 SHA-256 `a539514867e1273d55c3b23fdab910a73cbe57941b85d7d2fa32dc67956a4f22`
- [x] Harness PASS, 본 제품 Epic으로 P7 7/8·Production GO true는 변경하지 않음

## 7. 인도·복구

- [x] C3 사람용·기계용 증거와 C4 READY를 같은 사실로 기록
- [ ] C3 exact allowlist 완료 commit·push
- [ ] local/remote SHA 일치 기록

Production·staging에는 배포하지 않았다. C3 코드는 로컬 3서비스에서 검증됐으며 Git 완료 체크포인트 후 C4로 이동한다.
