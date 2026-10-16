---
name: sqcm-i-qr-lookup
description: 비품관리 QR 조회 화면의 수동 조회·카메라 시작과 반응형 배치를 조작·검증한다. 자산 등록·수정이나 인쇄는 포함하지 않는다.
---

# QR 자산 조회

로그인 후 메뉴의 `QR 자산 조회` 또는 `#view=qr-scan`을 연다. QR 주소·식별자를 입력하고 `자산 조회`를 누른다. 결과는 기존 조직·부서 권한 안에서만 표시되어야 한다. 오류이면 입력·권한을 확인하고 다시 조회하며 자산이나 권한을 자동 변경하지 않는다.

카메라는 사용자가 `카메라 스캔 시작`을 누른 뒤에만 요청한다. 권한 거부·미지원 기기에서는 수동 입력을 사용한다. 검증만을 위해 카메라 권한을 임의 승인하지 않는다.

배치 변경 시 `frontend/experience.css`의 `.qr-scan-card`, `.qr-result`, `.qr-manual-form`을 확인한다. 두 패널 내부 여백을 유지하고 입력·버튼·긴 식별자가 패널 밖으로 넘치지 않도록 한다. 390px와 1440px에서 실제 브라우저로 여백·줄바꿈·가로 넘침을 관찰하고 임시 viewport는 복구한다.

`npm.cmd run ui:contract`와 `node --test test/unit/offline-stocktake-pwa.test.js test/unit/ui-contract.test.js`로 회귀를 확인한다. CSS 배포 시 index와 service worker 캐시 참조를 함께 갱신한다. 화면 배치 PASS는 실제 자산 조회·카메라·권한 UAT 완료를 의미하지 않는다.
