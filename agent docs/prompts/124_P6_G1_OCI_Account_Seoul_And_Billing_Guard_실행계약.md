# P6-G1 OCI 계정·서울 홈 리전·과금 방지 실행계약

기준일: 2026-09-01

ROLE: 무료 PostgreSQL과 무료 클라우드 인프라의 비용·신원 경계를 분리해 검증하는 Production 인프라 관리자다.

GOAL: OCI 무료 계정 가입 경로를 확인하고 서울 `ap-seoul-1` 홈 리전과 무료 한도만 허용하는 과금 방지 조건을 고정한다.

SCOPE:
- OCI Free Tier 가입 화면과 요구 입력 확인
- PostgreSQL 라이선스 비용과 OCI 호스팅 계정 검증 비용 경계 분리
- Always Free A1 2 OCPU·12GB·100GB 후보와 금지 항목 기록
- Harness·현재 상태·로드맵 증거 동기화

OUT OF SCOPE:
- 사용자 법적 이름·주소·전화·이메일·카드의 대리 입력 또는 기록
- Pay As You Go 전환, 유료 Add-on, 과금 가능 리소스 생성
- VM·VCN·reserved IP·runner·DNS/TLS·Production 배포

INPUTS / SOURCE OF TRUTH:
1. 사용자의 무료 버전·PostgreSQL 결정과 현재 실행 요청
2. Oracle 공식 Free Tier FAQ·가입·Always Free·Region 문서
3. 프로젝트 Harness와 실제 브라우저·로컬 상태

WORKFLOW: Harness 검사 → 공급자 요구 확인 → 가입 화면 열기 → 비필수 쿠키 거절 → 민감 입력 전 중단 → 증거 동기화

AUTHORITY / PERMISSIONS:
- 공식 자료·로컬 상태 읽기와 가입 페이지 열기·비필수 쿠키 거절은 허용한다.
- 개인·결제 정보 입력, 이메일 인증과 tenancy 생성은 사용자 직접 행위 전에는 진행하지 않는다.

SUCCESS CRITERIA:
- PostgreSQL 자체 결제수단 불필요와 OCI 신원확인용 결제수단 요구가 구분된다.
- 서울 홈 리전과 무료 전용 자원 한도가 고정되고 유료 전환은 금지된다.
- 가입 화면이 준비되고 사용자 민감 입력 지점이 정확히 식별된다.

FAILURE CRITERIA:
- 4 OCPU·24GB를 Free-only 허용량으로 잘못 승격한다.
- 사용자 동의·직접 입력 없이 개인정보나 카드 정보를 저장·제출한다.
- 실제 tenancy 없이 계정·VM 생성 완료로 기록한다.

VERIFICATION / EVIDENCE:
- `npm.cmd run harness:status`, `npm.cmd run harness:check`, `npm.cmd run harness:verify`
- Oracle Cloud Free Tier 가입 화면과 공식 문서
- `agent docs/harness/P6_G1_OCI_ACCOUNT_SIGNUP_PREFLIGHT_EVIDENCE.json`

OUTPUTS / FORMAT:
- 사람용 Phase 보고서, 기계용 JSON, 현재 상태·로드맵의 동일 HOLD
- Secret·카드·개인정보 원문 제외

STOP CONDITION:
- 이름·이메일·주소·전화·카드 확인이 필요한 화면에서 `HOLD_USER_IDENTITY_AND_PAYMENT_VERIFICATION`으로 중단한다.
