# PE-C2 QR 자산 신분증·라벨 체크리스트

기준일: 2026-09-04 KST

상태: **진행 중 — 인증 브라우저 재검증 대기**

다음 READY: `PE-C2-QR-ASSET-IDENTITY-AND-LABEL-BROWSER-REVALIDATION`

## 1. 사용자 가치

- [x] QR 또는 수동 코드로 자산을 조회한다.
- [x] 조회 성공 시 기존 자산 상세 화면으로 연결한다.
- [ ] 실제 로그인 직원 화면에서 데스크톱·모바일 흐름을 확인한다.

## 2. 기능

- [x] 자산별 불투명 UUID와 고유 제약
- [x] 개별 SVG 라벨과 A4 12매 인쇄
- [x] 명시적 카메라 시작과 수동 입력 fallback
- [x] 유효·무효·로딩·오류·성공 상태

## 3. 보안·권한

- [x] QR payload에 자산번호·이름·사용자·Secret 미포함
- [x] 익명 접근 401, 잘못된 UUID 400
- [x] 인증 후 조직·부서 scope 재검사
- [x] scan 응답 `no-store`, 감사 `ASSET_QR_SCANNED`

## 4. 화면·접근성

- [x] 키보드 label, `aria-live`, 카메라 미지원 안내
- [x] 모바일 단일 열과 인쇄 전용 레이아웃
- [ ] 1440×900 실제 로그인 렌더
- [ ] 390×844 실제 로그인 렌더·가로 넘침 0

## 5. 데이터·운영

- [x] application migration 027 적용, 전체 26/26
- [x] 합성 자산·감사·outbox·멱등키·세션 exact cleanup
- [x] local frontend/backend만 갱신, database·staging·Production 미재생성
- [x] 보호 서비스에 시작·종료·설정 변경 없음

## 6. 검증 증거

- [x] 전체 check: 931 PASS / 8 SKIP / 0 FAIL
- [x] UI 계약: 34/34 PASS
- [x] PostgreSQL HTTP QR 계약: 8 PASS / 0 FAIL
- [x] local frontend/backend/database 3서비스와 QR bundle 확인
- [ ] 브라우저 자동화는 동일 실패 3회 뒤 중단했다. 원인은 dashboard 비동기 렌더 전에 QR view를 열어 후속 렌더가 덮어쓴 경쟁 조건이며, 실행기 wait 조건을 수정했지만 규칙상 즉시 네 번째 실행하지 않았다.

## 7. 인도·복구

- [x] C2 상태·미완료·다음 READY를 사람용/기계용 문서에 기록
- [ ] 브라우저 PASS 뒤 C2 완료 exact allowlist commit·push
- [ ] 완료 commit의 local/remote SHA 일치

현재 체크포인트는 C2 완료가 아니다. 실제 직원 계정으로 로컬 앱에 로그인한 뒤 QR 메뉴, 수동 조회, 자산 상세, 개별/A4 라벨을 데스크톱과 390×844에서 읽기 검증해야 C2를 닫고 C3를 연다.
