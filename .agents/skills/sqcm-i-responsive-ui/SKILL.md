---
name: sqcm-i-responsive-ui
description: 비품관리 전체 메뉴의 여백·줄바꿈·폼 잘림·탭 숨김·표 내부 스크롤을 PC와 모바일에서 점검한다. 업무 제출·계정 변경은 포함하지 않는다.
---

# 비품관리 반응형 UI 점검

기존 로그인 세션의 주 메뉴를 기준으로 1440px와390px에서 읽기 전용 이동한다. 관리자·요청함은 세부 탭과 기준정보의 접힌 폼도 펼쳐 확인한다. 제출·업로드·초대·MFA 등록·권한 변경·카메라 허용은 별도 승인 없이 실행하지 않는다.

`documentElement.scrollWidth <= clientWidth`, 표 이외 폼·필드·버튼의 패널 경계 내 배치, 카드 내부 여백, 한국어 줄바꿈을 DOM geometry와 실제 화면으로 대조한다. `overflow:hidden`으로 잘림을 감춘 것을 PASS로 세지 않는다. 표의 `.table-wrap` 내부 가로 스크롤과 일반 문서 넘침을 구분한다. 선택되지 않은 `[hidden]` 패널은 실제 크기0이어야 한다.

운영 데이터 없이 긴 선택지·날짜·파일 입력·금액·숨김 패널을 반복 검증하려면 `node scripts/ui-layout-preview.mjs`로 loopback3398의 합성 fixture를 연다. 포트가 이미 점유되었으면 기존 owner를 종료하지 않는다. 이 서버는 fixture와 제품 CSS만 제공하며 API·Secret·저장소 파일을 노출하지 않는다. 작업 후 자신이 띄운 preview만 종료한다.

`npm.cmd run ui:contract`, `npm.cmd run check`와 브라우저 회귀를 기록한다. CSS 배포는 index·service worker 버전을 동기화하며, 임시 viewport를 복구한다. 캡처에는 계정명부·인증값·운영 세부 데이터를 남기지 않는다. UI 관찰은 실데이터 업무·저장·권한 UAT와 구분한다. QR 고유 조작은 `../sqcm-i-qr-lookup/SKILL.md`를 따른다.
