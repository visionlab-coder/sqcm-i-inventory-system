# AI PC 브리지 발견 결과 — STOP 보고서

## 출처

`C:\Users\seowo\Downloads\Telegram Desktop\inventory_cost_bridge_discovery_2026-08-12.md`

## 확인된 상태

- LM Studio가 실행 중이며 OpenAI 호환 포트 `0.0.0.0:1234`와 내부 포트 `127.0.0.1:41343`가 사용 중이다.
- 로드된 모델은 `qwen2.5-3b-instruct`, embedding 모델은 `text-embedding-nomic-embed-text-v1.5`이다.
- 소놀봇 supervisor/worker는 실행 중이지만 공개 TCP/WebSocket 포트와 문서화된 named pipe가 없다.
- Codex app-server는 `stdio://`로만 실행되고, `sonolbot-client exec`는 비활성화되어 있다.
- `run-once`는 현재 버전 정책 오류로 실행 불가하다.
- 비품관리 전용 브리지 및 `127.0.0.1:18765` endpoint는 현재 생성·검증되지 않았다.

## 판정

**Phase 66 BLOCKED / STOP CONDITION 적용**

현재 조건에서 직접 LM Studio `/v1/chat/completions`를 호출하면 기존 봇과 분리한다는 원칙을 위반한다. `stdio://` stream이나 `codex-ipc` pipe를 억지로 재사용하는 것도 문서화된 계약이 아니므로 수행하지 않았다.

## 안전한 다음 경로

다음 중 하나의 공식 계약이 AI PC 제품에 추가되어야 Phase 67로 진행할 수 있다.

1. localhost 또는 사설망의 인증된 `/health`, `/recommend`, `/ocr` HTTP endpoint
2. 별도 client가 사용할 수 있는 명시적 pipe/socket 계약
3. JSON stdin/stdout 기반 별도 서비스 CLI와 timeout/error code 계약

계약이 제공되기 전에는 기존 LM Studio·소놀봇을 변경하거나 직접 호출하지 않고, 비품관리 시스템은 `rules` provider를 유지한다.

## 영향

- 비품관리 코드·설정·기존 AI PC 프로세스에는 변경이 없다.
- 실제 외부 모델 추천·OCR staging은 시작할 수 없다.
- 현재 제품은 규칙 기반 Cost 추천으로 계속 사용할 수 있다.
