# P7 새 비밀번호 조건 간소화

2026-10-15 KST. **Production 적용 완료**.

## 요구·범위

사용자 요청에 따라 새 비밀번호 조건을 10자 이상·영문·숫자·특수문자 포함으로 변경했다. 영문은 대문자 또는 소문자만 사용해도 된다. 비밀번호 비교 자체는 기존처럼 대소문자를 구분한다. 최초 변경·복구·초대 가입은 `src/password-policy.js`를 공통 정본으로 사용하며 화면 안내·minlength와 운영 credential reader도 맞췄다. 초기 비밀번호 재사용 금지·bcrypt cost12·CSRF·세션·RBAC는 유지한다.

## 완료 체크리스트

- [x] 최소10자 소문자 또는 대문자 비밀번호 허용, 9자·영문/숫자/기호 누락 거부 단위 경계검사.
- [x] 전체 구문검사·단위시험1031 PASS/0 FAIL/8 SKIP, UI 계약47 PASS.
- [x] 격리 후보 이미지에서 실제10자 비밀번호 최초 변경·재로그인 및 TOTP 생애주기2 PASS, HTTP/DB 기본 검사7건 PASS.
- [x] GitHub quality run38662909760의 unit·three-tier-integration SUCCESS. 초대는10자 소문자, 복구는10자 대문자 fixture로 실제 통합검증.
- [x] SHA `1e0f9145e1f4e93f9d7b7485319a33815c159321` 불변 backend/frontend 이미지 배포 및 health 통과.
- [x] 공개 HTML10자 안내·minlength10, 실제9자 입력400·재사용 거부·로그인200·로그아웃204 확인.
- [x] DB 컨테이너와 전체 계정 자격증명·역할 fingerprint 불변. 회사13계정과 최초 변경필수13개 유지. 실제 직원 최종 비밀번호 변경0건.
- [x] 공개 readiness·storage·malware PASS, Docker3 healthy, Inventory/SQCM-i 터널 연결 각4와 공개응답 보존.
- [x] 조작 안내·기능 연결 갱신. 인증 범위의 영향 검사 IMPACT_PLANNED 통과.
- [ ] 직원 각자가 새 조건으로 개인 비밀번호를 설정하고 업무 UAT.

## 복구·검증 한계

직전 이미지 SHA `edd552829e9f67b49e0f9ea075f5567d9a96d06c`를 보존하고 배포 health 실패 시 복귀하는 실행 경로로 배포했다. 실제 복귀·DB 복원은 이번에 실행하지 않았다. 사전 백업 `D:/seowon_runtime/sqcm-i-inventory-production/backups/pre-password-policy10-20261015.dump`, 3,798,231bytes, SHA-256 `be827844516e373a27b2010ffbca7ea9a64ec421d2212f4906a8c019098e3f37`.

전체 기능 등록부 검사에는 이번 변경과 무관한 기존 업로드 기능의 legacy 상태 표기 오류가 있다. 해당 항목을 제외한 임시 읽기 전용 인증 범위는 검사 통과했다. 새 조작 안내 frontmatter·경로·명령은 직접 검토했으나 skill-creator quick_validate는 호스트 Python/PyYAML 미가용으로 NOT_RUN이며 성공으로 기록하지 않았다. 이 문서의 완료는 제품 인증 정책 적용·검증 범위이며 전체 프로젝트·전역 스킬 정비 완료 선언이 아니다. P7은7/8 유지.
