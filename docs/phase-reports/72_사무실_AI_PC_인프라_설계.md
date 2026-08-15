# Phase 72 — 사무실 AI PC 격리형 브리지 인프라 설계 보고서

## 1. 결과 / 상태

**상태: 증거 있는 로컬 완료 / 외부 AI PC 전환 HOLD**

프롬프트 엔지니어링 계약에 따라 Phase 72 메타프롬프트와 사무실 AI PC 인프라 설계를 작성했다. 제품 백엔드는 기존 LM Studio와 SONOL BOT을 직접 호출하지 않고, 별도 `inventory-cost-bridge`의 `/health`, `/ready`, `/recommend`, `/ocr` 계약만 사용하도록 경계를 고정했다. 기존 포트 `1234`, `18765`는 변경하지 않았으며, 신규 브리지 후보 `18766`은 예약 설계로만 남겼다.

## 2. 변경·점검 범위

### 새 문서

- `agent docs/prompts/72_사무실_AI_PC_인프라_설계_메타프롬프트.md`
- `develop docs/31_사무실_AI_PC_인프라_설계.md`

### 이번 Phase에서 확인한 로컬 계약

- `src/adapters/http-ai-provider.js`: 도메인 JSON recommend/OCR, health/readiness 계약
- `src/config.js`: 외부 AI 네 endpoint, HTTPS production gate, secret-file 지원
- `scripts/ai-bridge-preflight.mjs`: health/ready 읽기 전용 사전점검과 secret 비노출
- `config/operations.manifest.example.json`, `src/operations/gates.js`: AI endpoint/model/secret 운영 gate

### 하지 않은 일

- AI PC의 프로세스 시작·종료·재설정·모델 설치
- LM Studio `1234`, SONOL BOT/기존 브리지 `18765` 변경
- 후보 포트 `18766` bind
- DNS/TLS/방화벽/Windows 서비스/secret 생성
- 운영 배포, commit, push, 외부 계정 연결

## 3. 검증 증거

| 명령 | 결과 |
|---|---|
| `npm.cmd run check` | JavaScript syntax 90개 통과, unit 105/105 통과 |
| `npm.cmd run ui:contract` | UI contract 13개 통과 |
| `npm.cmd run ai:preflight` | `skipped`, driver=`rules`, external provider 비활성 |
| `python .../validate_prompt_contract.py ...72... --strict --json` | PASS, required groups 8/8, warnings 0 |
| `git diff --check` | 오류 없음. CRLF 변환 경고만 출력 |

실제 AI provider 호출과 Docker 운영 검증은 수행하지 않았다. `rules` 모드에서 preflight가 skip되는 것은 외부 AI가 연결됐다는 증거가 아니다.

## 4. 설계 핵심과 안전 경계

- 백엔드→브리지 경로는 사설망 HTTPS와 bearer secret 또는 mTLS로 제한한다.
- 브리지는 별도 비관리자 서비스 계정, 독립 runtime/model, `/ready` 모델 checksum, 동시성·timeout·circuit breaker·rate limit를 갖는다.
- 로그에는 요청 ID·상태·지연·provider/model version·fallback 사유만 남기며 OCR 텍스트·토큰·Authorization 헤더를 남기지 않는다.
- AI 추천은 구매·이전 권한을 부여하지 않고 기존 승인 workflow와 사용자 확인을 거친다.
- 실제 runtime·모델·health/ready·TLS·방화벽·secret 증거가 없으면 production은 `HOLD`이며 rules fallback만 허용한다.

## 5. 미완료·위험·외부 게이트

1. **AI PC 독립 runtime 미확인** — 1235에 runtime이 있다는 추정이나 기존 `ollama` 프로세스만으로는 계약을 충족하지 않는다.
2. **브리지 endpoint 미기동** — 18766 listener, `/health`, `/ready`, 추천/OCR schema의 실제 HTTP 증거가 없다.
3. **TLS·인증 미발급** — 내부 CA/mTLS 또는 bearer secret 저장·교체 절차의 실제 운영 증거가 없다.
4. **방화벽·서비스 수명주기 미적용** — Windows service 계정, 자동 재시작, source allowlist, 로그 보존을 AI PC에서 적용하지 않았다.
5. **실제 AI 품질·현장 UAT 미검증** — 추천 정확도·비용 절감·OCR 품질·fallback·역할별 승인 흐름의 파일럿 결과가 없다.
6. **운영 인프라 미검증** — 이 세션에서 Docker daemon이 unavailable이었고, production audit/DNS/TLS/백업·복구·모니터링은 외부 환경 증거가 필요하다.

## 6. 다음 READY 작업

AI PC 운영자가 기존 서비스에 손대지 않고 다음 비밀 없는 증거를 제공한다.

```text
G1: 독립 bridge/runtime 서비스 이름, 실행 파일 경로, model checksum, 실행 계정
G2: listener 주소/포트, backend source allowlist, 내부 DNS, TLS 인증서 체인 상태
G3: /health와 /ready의 status/modelVersion, recommend/ocr 계약 테스트 결과
G4: 인증 방식과 secret reference 이름(값 자체 금지), timeout/rate/concurrency, 로그 마스킹
```

그 증거가 오기 전에는 어떤 프로세스도 시작·종료하지 않고 `HOLD`를 유지한다.
