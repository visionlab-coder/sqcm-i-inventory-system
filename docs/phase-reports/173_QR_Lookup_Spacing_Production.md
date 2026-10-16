# QR 자산 조회 여백 보완

2026-10-17 KST. 요청한 화면 배치 수정은 운영 반영·검증 완료. 전체 P7은 별도 정본상 7/8 유지.

## 계약·원인

사용자는 다른 메뉴와 달리 QR 조회 카드에 여백이 없음을 보고했다. 원인은 공통 panel이 테이블용 무여백 컨테이너인데 QR 입력·결과 카드에는 전용 padding이 없었던 것이다. 인접 메뉴·업무 로직·인증·데이터는 수정하지 않는다. 성공 기준은 두 카드 내부16px 이상 여백, 390/1440px에서 가로 넘침0, 기존 공개 서비스·backend·DB 보존이다. 결정은 사용자 확정 범위의 RULE, execution_mode=single이다.

## 체크리스트

- [x] 화면·정본: 운영 QR 화면에서 기존 padding0 관찰, 사용자 요청과 CSS 원인 대조.
- [x] 구현: 카드16~24px padding, 입력·grid 최소 너비0 및 긴 결과 식별자 줄바꿈.
- [x] 캐시: CSS query와 service worker cache를 `20261017-qr-spacing`으로 동기화.
- [x] 회귀: `npm.cmd run check` 구문501개·단위1031 PASS/0 FAIL/8 SKIP, `npm.cmd run ui:contract`47 PASS, 집중시험4 PASS. 명령 종료0.
- [x] 배포: 같은 후보 SHA GitHub quality38982935955 SUCCESS, 불변 frontend 이미지 배포·healthy. backend·database 컨테이너 ID 불변. 공통 release tag의 backend 호환 이미지는 빌드만 했고 backend 재시작은 하지 않았다.
- [x] 브라우저·서비스: 로그인된 운영 QR 화면1440px의 카드 padding24px·문서너비1440/1440, 390px의 padding16px·문서너비375/375(세로 scrollbar 제외), 카드 scrollWidth=clientWidth. 두 화면 시각 확인, 임시 viewport 복구. 공개 smoke PASS, Inventory/SQCM-i Tunnel 연결 각각4, SQCM-i OS200·safe-link301 보존.
- [x] 조작·복구: `sqcm-i-qr-lookup` 스킬과 기능·회귀 연결 등록, 기존 frontend 이미지를 보존. 코드 commit·push SHA `0c7ba0cb001bc1123860dab834a33bb857a92ffe`, 원격 일치 확인. 완료 기록은 후속 문서 체크포인트에 포함.

## 증거·한계

기계 증거: `agent docs/harness/QR_LOOKUP_SPACING_20261017_EVIDENCE.json`. CI: https://github.com/visionlab-coder/sqcm-i-inventory-system/actions/runs/38982935955 . 브라우저 화면은 이 작업의 도구 캡처에 남겼다. 실제 자산 QR 조회·카메라 허용·권한 UAT·rollback 실행은 NOT_RUN이며 배치 관찰만으로 승격하지 않았다. Python/PyYAML 기반 skill quick_validate는 호스트 미가용으로 NOT_RUN; frontmatter와 경로·명령은 직접 검토. 기존 업로드 기능 registry legacy 상태 오류는 이번 UI 수정과 무관하여 변경하지 않았다. AGENTS.md 등 기존 사용자 변경4개는 커밋에서 제외했다.

복귀 시 정확한 이전 tag `sha-1e0f9145e1f4e93f9d7b7485319a33815c159321`로 runtime RELEASE_TAG를 되돌리고 동일 Compose 설정의 frontend만 no-deps/no-build로 교체한다. DB 복원·backend·기존 터널 재시작은 필요하지 않다. 기존 탭에 옛 캐시가 남으면 새로고침 후 QR 자산 조회 메뉴를 선택한다.
