# PE-C2 QR 자산 신분증·라벨 실행 계약

기준일: 2026-09-04 KST

## 1. 목적

인증된 직원이 QR 또는 수동 코드를 사용해 현장에서 자산을 즉시 확인하고, 권한이 있는 자산만 상세 화면으로 연결한다.

## 2. 범위

- 조직 종속 불투명 QR 식별자
- 인증·조직·부서 scope를 재검사하는 조회 API
- 개별/A4 QR 라벨과 카메라·수동 입력 UI
- PostgreSQL migration, 단위·HTTP·UI 계약·브라우저 검증

비범위는 공개 자산 조회, RFID/GPS/BLE, Production 배포, 실제 라벨 대량 인쇄다.

## 3. 처리 방식

`역조건 고정 → migration/service/API → 화면·인쇄 → 단위·HTTP·브라우저 → 증거 → exact allowlist Git 체크포인트` 순서로 한 READY만 수행한다.

## 4. 입력 정본

현재 사용자 요구, 프로젝트 지침, `develop docs/34_SQCM-i_C_제품고도화_로드맵.md`, 실제 코드·DB·테스트·브라우저 상태 순이다.

## 5. 권한

로컬 코드·테스트·문서와 로컬 application DB의 forward migration만 허용한다. Production·staging·계정·Secret·DNS/TLS와 보호 서비스는 변경하지 않는다.

## 6. 성공·실패 기준

성공은 QR payload에 개인정보/Secret이 없고, 익명·잘못된 UUID·다른 조직/부서 접근이 차단되며, 개별/A4 라벨과 1440×900·390×844 브라우저 흐름이 실제 증거로 PASS하는 것이다. 브라우저 증거가 없으면 C2를 완료로 승격하지 않는다.

## 7. 검증 증거

단위·전체 `check`, UI 계약, migration 26/26, PostgreSQL HTTP 8계약, 로컬 3서비스 health, 실제 로그인 브라우저 데스크톱·모바일 증거와 Git SHA를 사용한다.

## 8. 산출물

코드·migration·테스트, `PE_C2_QR_ASSET_IDENTITY_EVIDENCE.json`, C2 7범주 체크리스트, 제품 로드맵·현재 상태와 exact allowlist Git 체크포인트다.
