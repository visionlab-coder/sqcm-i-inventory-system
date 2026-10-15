---
name: sqcm-i-company-login
description: Operate Inventory company-email first-login password changes, recovery and invitation acceptance using the shared project password policy.
---

# Inventory 회사 이메일 로그인

인증 공통 절차는 `bamsoft-login-lifecycle`을 따르고 프로젝트 차이만 여기에 둔다.

- 정책 정본: `src/password-policy.js`. 새 비밀번호는 10자 이상, 영문·숫자·특수문자 포함이며 대소문자 혼합은 필수가 아니다. 로그인 비교는 대소문자를 구분한다.
- 사람 진입점: 회사 이메일 로그인 → 최초 변경 화면 → 현재 비밀번호·새 비밀번호·확인 입력. 변경 완료 후 업무 화면으로 이동한다.
- 에이전트 진입점: CSRF 세션을 얻고 `/api/auth/login` → `/api/auth/password/change-required` → 보호 API → `/api/auth/logout` 순서로 같은 세션을 사용한다. 기존 비밀번호 재사용은 거부한다.
- 복구와 초대 수락도 같은 검증기를 사용한다. 토큰 만료·재사용 차단 및 변경 후 세션 폐기를 유지한다.
- 계정 초기화·실제 사용자 비밀번호 변경은 해당 사용자 승인 범위에서만 수행한다. 실제 직원의 최종 개인 비밀번호는 에이전트가 정하지 않는다. 비밀번호·토큰·쿠키를 출력하거나 파일에 저장하지 않는다.
- 실패 시 입력 오류400, 잘못된 현재 비밀번호401, 최초 변경 전 업무403을 구분한다. 입력 오류를 계정 잠금 해제나 인증 우회로 해결하지 않는다.
- 검증: `node --test test/unit/production-local-auth.test.js test/unit/production-role-core-smoke.test.js`; 격리 환경과 CI에서 `test/integration/http-smoke.test.js`의 최초 변경·복구·초대 시험. 실제 직원 UAT와 합성 시험을 구분한다.
