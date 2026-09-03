# P7 한글 표시명 및 화면 배치 보완

기준일: 2026-09-03  
결과: **PASS — Production 반영**

## 체크리스트

- [x] 신뢰 명단과 Production 회사 계정을 이메일 기준으로 대조
- [x] 초기 USER 계정의 깨진 한글 표시명 범위 확인
- [x] 변경 전 PostgreSQL custom-format 백업 및 SHA-256 생성
- [x] 9개 대상 표시명을 신뢰 명단의 정확한 UTF-8 이름으로 교정
- [x] 비밀번호·역할·상태·세션은 변경하지 않음
- [x] 계정별 `COMPANY_DISPLAY_NAME_ENCODING_REPAIRED` 감사 이벤트 기록
- [x] USER·마스터 계정 입력에서 유니코드 대체문자 표시명을 fail-closed
- [x] 모든 메뉴 제목의 강제 줄바꿈 제거
- [x] 제목 크기·행간·한글 줄바꿈 규칙 보완
- [x] 초기 비밀번호 변경 화면을 계정·조건·입력·행동 순서로 재배치
- [x] 비밀번호 조건과 입력을 `aria-describedby`로 연결
- [x] 520px 이하 모바일 간격과 1열 조건 목록 적용
- [x] Production frontend 무중단 hotfix 및 공개 HTTPS 확인
- [x] Docker 3서비스, 비공개 backend/database와 보호 포트·PID 보존
- [ ] 실제 계정 로그인 후 초기 비밀번호 변경 화면 확인 — 사용자 자격증명 입력 필요

## 결과

초기 회사 USER 생성 과정에서 표시명에 유니코드 대체문자가 저장된 계정을 확인했다. 신뢰 명단의 이메일과 이름을 정본으로 사용해 대상 9건을 트랜잭션으로 교정했으며, 교정 후 정확한 UTF-8 일치 결과는 9/9다. 계정 비밀번호·역할·상태·세션은 변경하지 않았다.

메뉴 제목에 삽입되어 있던 강제 `<br>` 12건을 제거하고, 한글 제목이 화면 너비에 따라 자연스럽게 배치되도록 크기·행간·줄바꿈 규칙을 조정했다. 초기 비밀번호 변경 화면은 로그인 계정, 새 비밀번호 조건, 입력 필드, 주·보조 행동의 순서로 다시 구성했다.

## 검증

- 전체 단위검사: 915 PASS, 0 FAIL, 8 SKIP
- UI 계약: 25/25 PASS
- JavaScript 구문: 431개 PASS
- 공개 HTML/CSS/JavaScript: HTTP 200
- 공개 health: `ok`
- 메뉴 제목의 강제 `<br>`: 0건
- Production DB 표시명: 9/9 정확한 UTF-8 일치
- 감사 이벤트: 9건
- 운영 Compose: frontend/backend/database 3서비스
- backend/database host port: 0/0
- 보호 listener: 1234/6632, 11434/8588, 18765/22716, 18766/65724

기계 증거: `agent docs/harness/P7_KOREAN_NAME_AND_UX_REPAIR_EVIDENCE.json`

실제 비밀번호 입력과 최종 비밀번호 변경은 사용자가 수행해야 하므로 인증 후 화면 확인은 `NOT_RUN_USER_CREDENTIAL_REQUIRED`로 남긴다.
