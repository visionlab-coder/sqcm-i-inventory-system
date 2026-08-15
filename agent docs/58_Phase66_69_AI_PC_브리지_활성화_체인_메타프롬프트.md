# Phase 66~69 AI PC 브리지 활성화 체인 메타프롬프트

## 공통 원칙

- 현재 LM Studio 봇·모델·대화 세션·소놀봇 데몬을 중단, 삭제, 재설정, 모델 unload하지 않는다.
- ChatGPT 구독·Codex 대화창을 운영 런타임으로 사용하지 않는다.
- 비품관리 시스템은 AI 장애 시 규칙 기반 Cost 추천으로 안전하게 fallback한다.
- 직원명·이메일·세션·비밀번호·API key를 AI PC로 보내지 않는다.
- 모든 추천은 제안 상태로만 저장하고 관리자 승인 전 자동 상태 변경을 금지한다.
- AI PC의 브리지 endpoint와 모델 호출은 별도 프로세스·별도 포트·별도 로그로 격리한다.

---

## Phase 66 — AI PC 브리지 발견·격리

ROLE:
AI PC 운영 브리지 엔지니어

GOAL:
기존 소놀봇/LM Studio 실행 상태를 보존한 채 비품관리 전용 브리지의 실제 호출 방식을 발견하고 별도 실행 경계를 만든다.

USERS:
Cost 담당자, 자산 관리자, AI PC 운영자

CONTEXT:
비품관리 backend는 외부 AI provider 계약을 지원한다. AI PC는 LM Studio에서 여러 봇을 사용하고 있으며 소놀봇 데몬이 GPT 연동을 담당한다. 현재 브리지 endpoint와 포트는 미확정이다.

SCOPE:
기존 데몬의 명령/HTTP/WebSocket/CLI 인터페이스 read-only 조사, 별도 브리지 디렉터리·포트·프로세스 정의, health 계약 설계.

OUT OF SCOPE:
기존 봇 중단·모델 교체·설정 변경, 외부 공개, 개인정보 전송, 비품관리 backend 코드 변경.

CONSTRAINTS:
브리지는 `127.0.0.1` 또는 승인된 내부 주소에만 바인딩한다. 기존 포트와 충돌하지 않는다. 원문 프롬프트·토큰을 로그에 남기지 않는다.

SUCCESS CRITERIA:
기존 봇 상태가 변경되지 않고, 브리지 프로세스/포트/모델 식별자/health URL이 문서화된다.

OUTPUTS:
브리지 실행 방법, endpoint 목록, 포트, 모델명, health 응답 예시, 기존 시스템 무변경 확인서

STOP CONDITION:
기존 데몬을 중단하거나 설정을 변경해야만 연결되는 경우 즉시 중단하고 별도 runtime 선택을 요청한다.

---

## Phase 67 — Cost 추천 브리지 계약 구현

ROLE:
AI provider adapter 엔지니어

GOAL:
비품관리 시스템이 호출할 수 있는 안전한 추천·OCR·health endpoint를 브리지에 구현한다.

REQUIRED ENDPOINTS:

- `GET /health`
- `POST /recommend`
- `POST /ocr` (지원하지 않으면 `NOT_CONFIGURED`)

RECOMMEND 입력:

```json
{"organizationId":1,"query":{},"assets":[{"id":123,"asset_tag":"IT-001","name":"노트북","status_code":"AVAILABLE","acquisition_cost":1000000,"repair_cost":0,"transfer_cost":10000}]}
```

RECOMMEND 출력:

```json
{"provider":"sonolbot-local","modelVersion":"model-id","recommendations":[{"assetId":123,"actionType":"TRANSFER","estimatedCost":10000,"avoidedCost":1000000,"confidence":0.85,"evidence":["AVAILABLE","transfer_cost=10000"]}],"usage":{}}
```

CONSTRAINTS:
입력된 assetId만 반환한다. actionType은 TRANSFER/REPAIR/REPLACE/HOLD만 허용한다. confidence는 0~1이다. evidence를 필수화한다. timeout·rate limit·인증 토큰·구조화 오류를 구현한다.

SUCCESS CRITERIA:
health 200, 정상 추천 200, 잘못된 JSON/타 asset/timeout/모델 오류가 안전한 오류 코드로 반환된다.

---

## Phase 68 — Staging 파일럿·평가·승인

ROLE:
Cost AI 품질 검증자

GOAL:
실제 운영 전 30~50개의 과거 또는 승인된 샘플로 규칙 추천과 브리지 추천을 비교한다.

MEASURE:
추천 정확도, 이동·수리·교체 선택 일치율, 회피 가능액 오차, 응답시간 p95, 실패율, 모델별 비용/토큰, 관리자 수락률

CONSTRAINTS:
실제 개인정보 대신 비식별 자산 데이터부터 사용한다. 자동 실행 금지. 모든 결과에 provider·modelVersion·evidence를 기록한다.

SUCCESS CRITERIA:
제품 담당자가 정한 정확도·비용·지연 임계치를 충족하고, 관리자 승인/거절 사유가 feedback ledger에 저장된다.

FAILURE CRITERIA:
근거 없는 추천, 타 조직 자산 노출, confidence 누락, 비용 한도 초과, timeout 반복이면 rules fallback으로 복귀한다.

---

## Phase 69 — 전용 runtime 승격·Production Gate

ROLE:
운영·보안 승인자

GOAL:
파일럿 결과가 승인된 경우에만 AI PC 브리지를 전용 서비스로 승격한다.

REQUIRED:
고정 모델/모델 checksum, 자동 재시작, health/readiness, 내부 TLS 또는 private network, secret manager, request ID, redacted logs, queue/concurrency 제한, circuit breaker, rollback, 백업·복구 증거

SUCCESS CRITERIA:
운영 adapter health, staging smoke, 역할별 UAT, AI 평가 run, 비용 예산, 개인정보 처리 승인, 롤백 절차가 모두 증거로 남는다.

STOP CONDITION:
실제 endpoint·운영 secret·품질 승인·현장 UAT 중 하나라도 없으면 Production 승격을 금지하고 Internal Pilot 상태를 유지한다.
