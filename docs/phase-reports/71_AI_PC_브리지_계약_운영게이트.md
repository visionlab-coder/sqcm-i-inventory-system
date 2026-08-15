# Phase 71 AI PC 브리지 계약·운영 게이트 보고서

## 결과 / 상태

**저장소 계약 PASS / 외부 AI 연결 HOLD**

HTTP AI adapter를 OpenAI 전용 envelope가 아닌 비품관리 도메인 JSON 계약으로 정렬했다. `/recommend`, `/ocr`, `/health`, `/ready` 네 endpoint와 modelVersion·timeout·Secret file·HTTPS 운영 조건을 설정·manifest·preflight·단위 테스트에 동일하게 적용했다.

## 변경 범위

- `src/adapters/http-ai-provider.js`: 직접 도메인 JSON 요청·응답과 health/readiness
- `src/config.js`: 네 endpoint, HTTPS, API key file 설정
- `src/adapters/contracts.js`: readiness 계약 fail-closed
- `src/operations/gates.js`, `config/operations.manifest.example.json`: AI 공급자·Secret reference 운영 게이트
- `scripts/ai-bridge-preflight.mjs`, `scripts/operations-preflight.mjs`: 읽기 전용 사전검사
- 관련 단위 테스트와 production 예시 환경

## 검증 증거

| 검증 | 결과 |
|---|---|
| Phase 71 Prompt Contract | strict 8/8 PASS |
| `npm.cmd run check` | 구문 91개, 단위 105/105 PASS |
| `npm.cmd run ui:contract` | 13 PASS |
| `npm.cmd run operations:contracts` | AI 포함 manifest·12개 cutover template 계약 PASS |
| `npm.cmd run ai:preflight` | `rules` 모드이므로 외부 호출 없이 skipped |
| `git diff --check` | 오류 없음 |

## HOLD 근거

실제 AI PC의 독립 runtime·고정 모델 checksum·listener·HTTPS 인증·Secret reference·health/readiness·조직 경계·품질 UAT 증거가 없다. 따라서 `AI_PROVIDER_DRIVER=external` 전환과 Production GO를 승인하지 않는다. 상세 인프라·설치 게이트는 Phase 72 설계를 따른다.
