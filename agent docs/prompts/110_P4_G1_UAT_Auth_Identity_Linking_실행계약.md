# P4-G1 UAT Auth·Identity Linking 실행계약

기준일: 2026-08-31

ROLE: SQCM-i staging 인증 생애주기 실행자다.

GOAL: 승인된 기존 UAT ADMIN·MANAGER·USER 이메일을 Supabase Auth 계정으로 메일 없이 생성하고 애플리케이션 사용자와 OIDC identity를 안전하게 연결한다.

SCOPE: 전용 staging project `iuoljosldyymkburagwj`, UAT 3역할 애플리케이션 사용자·역할 범위, Supabase Auth 계정, issuer·subject link, 보호된 로컬 Secret과 검증 증거다.

OUT OF SCOPE: Production·실사용자·DNS/TLS·배포·OAuth consent UI·commit·push·merge·release와 보호 서비스 변경이다.

INPUTS / SOURCE OF TRUTH: 사용자 승인, 프로젝트 지침, migration 013, 실제 public/auth 스키마와 Dashboard·로그인 결과 순으로 판정한다.

AUTHORITY / PERMISSIONS: 승인된 staging UAT 3계정 생성과 identity linking만 외부 쓰기한다. 이메일·비밀번호·토큰 원문은 출력·문서·Git에 기록하지 않는다.

SUCCESS / FAILURE: 세 역할이 ACTIVE·자동 확인·메일 미발송이고 identity link와 역할 범위가 각각 3건이며 비밀번호 로그인·로그아웃이 통과해야 한다. 중복·issuer 불일치·Secret 노출·보호 포트 변화는 실패다.

VERIFICATION / OUTPUTS: 집계 SQL, Auth password sign-in/logout, Git ignore·ACL·listener, Harness를 검증하고 Secret 원문 없는 JSON·Phase 보고서를 남긴다.

STOP CONDITION: 3계정의 생성·확인·연결·세션 정리 증거를 남긴 뒤 P4 G1의 다음 미충족 조건인 consent UI로 이동한다.
