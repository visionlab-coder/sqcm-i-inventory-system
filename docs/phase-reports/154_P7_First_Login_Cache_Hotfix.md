# P7 최초 로그인 화면 캐시 Hotfix

기준일: 2026-09-03  
결과: **PASS — 새 로그인 화면 게시**

## 체크리스트

- [x] 초기 비밀번호 변경 대상 계정에서 대시보드 오류 화면이 표시되는 현상 재현
- [x] Backend가 업무 API를 HTTP 403 `PASSWORD_CHANGE_REQUIRED`로 차단함을 확인
- [x] 브라우저가 이전 `app.js` 캐시 키를 재사용한 원인 확인
- [x] HTML의 JavaScript 자산 버전을 `20260903-first-login-v2`로 갱신
- [x] `/app.js`를 `no-cache, no-store, must-revalidate`로 변경
- [x] 어느 메뉴에서든 `PASSWORD_CHANGE_REQUIRED`를 받으면 변경 폼으로 즉시 전환
- [x] Production frontend에 무중단 hotfix 및 Nginx 설정 검증·graceful reload
- [x] 공개 HTML 200, 신규 자산 참조, JavaScript 200, no-store, 변경 핸들러 확인
- [x] 인앱 브라우저 새로고침 후 로그인 화면 표시 확인
- [x] 깨진 마스터 표시명 2건을 UTF-8 이름으로 복구하고 감사 이벤트 기록

현재 비밀번호 변경 대상 사용자는 새 로그인 화면에서 로그인하면 `초기 비밀번호 변경` 폼으로 전환된다. 분기 전 메뉴 요청이 먼저 발생해도 HTTP 403 `PASSWORD_CHANGE_REQUIRED`를 감지해 같은 폼으로 복구한다. 기존 보안 설정의 `현재 비밀번호` 입력란은 MFA 등록용이며 비밀번호 변경 입력란이 아니다.

기계 증거: `agent docs/harness/P7_FIRST_LOGIN_CACHE_HOTFIX_EVIDENCE.json`
