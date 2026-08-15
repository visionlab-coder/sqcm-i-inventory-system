# Phase 65 외부 AI provider 실연결 메타프롬프트

ROLE:
공급자 독립형 AI 현장 자산 Cost Control의 운영·보안 엔지니어

GOAL:
규칙 기반 fallback과 실제 외부 AI/OCR provider를 명확히 분리하고, 운영 설정이 유효한 경우에만 추천·OCR을 호출할 수 있게 한다.

USERS:
Cost 담당자, 자산 관리자, 현장 직원, 운영·보안 관리자

CONTEXT:
Phase 60~64에서 단일 자산 원장, Cost ROI, AI 피드백·평가 원장을 완료했다. 현재 개발 기본값은 `AI_PROVIDER_DRIVER=rules`이며 외부 모델 자격증명은 저장하지 않는다.

SCOPE:
HTTP AI adapter의 추천·OCR·healthCheck, endpoint/model/timeout 설정, built-in loader, external 계약 검증, Cost 화면의 provider/model 표시, provider 응답 JSON·usage 정규화, 단위·통합·반응형 검증.

OUT OF SCOPE:
특정 AI 회사의 API key 발급·결제, 운영 secret 저장, 모델 학습 데이터 생성, 실제 외부 endpoint로의 개인정보 전송, vendor별 OCR 포맷 확정.

CONSTRAINTS:
API key를 로그·DB·브라우저에 노출하지 않는다. production custom adapter는 fail-closed한다. built-in external endpoint는 HTTPS를 요구한다. 추천 자산은 DB에서 허용된 organization/department 범위를 벗어나지 못한다.

TOOLS:
Node.js 22+, native fetch, Docker Compose, Node test runner, UI contract, in-app browser

WORKFLOW:
1. provider 계약과 환경변수를 정의한다.
2. HTTP adapter의 timeout·JSON parsing·인증 헤더·healthCheck를 구현한다.
3. loader와 app validation에 연결한다.
4. Cost 화면에 provider/model을 표시한다.
5. fake fetch 단위 테스트, Docker 회귀, 375/1440px 브라우저 검증을 수행한다.

SUCCESS CRITERIA:
외부 provider 계약 테스트와 built-in loader 테스트가 통과한다. rules 환경에서 기존 기능이 유지된다. 외부 응답은 추천 목록·OCR fields/confidence·usage로 정규화된다. 375px와 1440px에서 수평 overflow가 없고 콘솔 오류가 없다.

FAILURE CRITERIA:
endpoint 누락을 허용하거나, provider 오류를 규칙 결과로 위장하거나, API key를 응답/로그에 포함하거나, 타 조직 asset을 provider payload에 포함하면 실패다.

OUTPUTS:
`src/adapters/http-ai-provider.js`, 설정·loader 변경, 테스트, Phase 65 보고서

VERIFICATION:
`npm.cmd run check`, `npm.cmd run ui:contract`, Docker `npm.cmd run test:integration`, `npm.cmd run db:verify`, 375/1440px 브라우저 스모크

MEMORY UPDATE:
현재 provider driver, 모델 버전, endpoint 설정 여부, 테스트 수, 실제 외부 provider 연결 여부를 기록한다. secret은 기록하지 않는다.

STOP CONDITION:
실제 외부 provider credential 또는 데이터 전송 승인이 없으면 built-in adapter와 계약 검증까지만 완료하고, 실제 모델 호출 완료로 보고하지 않는다.
