# Phase 84 — P3 독립 Runtime·Bridge 구축

기준일: 2026-08-25

## 결과

`PASS_RUNTIME_BRIDGE / P3_IN_PROGRESS`

승인된 P3 독립 runtime 범위에서 D: 전용 runtime과 bridge를 구축했다. SQCM-i 비품 backend의 provider 전환은 아직 실행하지 않았다.

## 공급망·라이선스

| 대상 | 고정 기준 | 검증 |
|---|---|---|
| llama.cpp | 공식 `b10516`, commit `b95502b`, Windows CUDA 13.3 x64 | archive 2/2 SHA-256 MATCH, MIT |
| Qwen model | 공식 `Qwen2.5-7B-Instruct-GGUF`, revision `bb5d59e…`, Q4_K_M | split 2/2 SHA-256 MATCH, Apache-2.0 |
| 모델 manifest | 두 split 파일명·SHA-256 정본 | `sha256:7e8649b8cd37da9eed18d5d3ac7c969ce1b045887d398cf27a675f4e377c5e20` |

사전검토 판정은 `ALLOW_WITH_CONDITIONS`였다. 공식 배포처·정확한 release/revision·checksum·라이선스를 고정하고 D: 신규 경로와 loopback에만 설치하는 조건을 적용했다.

## 실행 상태

| 항목 | 결과 |
|---|---|
| runtime | `127.0.0.1:18767`, API key 파일 인증, localhost CORS |
| bridge | `127.0.0.1:18766`, bearer 인증, 조직 allowlist `[1]` |
| 자동 시작 | 현재 사용자 로그온 예약 작업 2개, 제한 권한, Running |
| Secret | 64자 난수 파일 2개, 상속 차단, SYSTEM·현재 사용자만 ACL |
| health/ready | health `ok`, 무인증 ready 401, 인증 ready `ready` |
| 추천 합성 시험 | 입력 자산 7001만 반환, `TRANSFER` |
| OCR 합성 시험 | fields·confidence 객체 반환 |
| 장애·복구 | runtime 중단 시 bridge ready 503, task 재시작 후 ready 복구 |
| Docker 도달성 | backend → `host.docker.internal:18766/health` 200 |

관리자 권한이 없어 SYSTEM Windows Service는 만들지 않았다. 대신 현재 사용자 로그온 후 시작되는 최소권한 예약 작업으로 제한했으며, 로그온 전 무인 운영은 아직 보장하지 않는다.

## 검증

- JavaScript 구문 101개 PASS
- 단위 테스트 116/116 PASS
- 저장소 위생 PASS
- Harness PASS
- Compose AI override는 frontend/backend/database 정확히 3서비스 유지
- AI Secret은 inline 환경변수가 아니라 `/run/secrets/ai_provider_api_key` 파일 계약
- SQCM-i OS `/api/state`: models 37, awake 8
- 보호 listener 보존: 1234/PID 6632, 11434/PID 8588, 18765/PID 22716

## 변경·비변경 경계

생성: `D:\seowon_runtime\sqcmi-inventory-ai`, loopback listener 18766·18767, 현재 사용자 예약 작업 2개, 전용 Secret 파일 2개.

변경하지 않음: LM Studio·Ollama·wslrelay, 기존 37봇 설정, 방화벽, DNS/TLS, DB, 비품 backend 환경·컨테이너, Production.

## 다음 READY

`P3-SQCMI-ADAPTER-CONNECTION-APPROVAL`: `compose.ai.yaml`과 승인된 Secret 파일 mount를 적용해 `seowon-inventory-local`의 backend만 재생성하고 external provider preflight·API 통합·rules fallback을 검증한다. DB migration, frontend/database 재생성, 운영 배포는 포함하지 않는다.
