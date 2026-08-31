# Phase 85 — P3 SQCM-i Adapter 연결 실패와 Rollback

기준일: 2026-08-25

## 판정

`HOLD_OCR_SCHEMA / ROLLBACK_PASS`

승인된 범위에서 `seowon-inventory-local` backend만 external AI provider로 재생성했다. adapter health·ready와 추천은 통과했지만 OCR이 HTTP 502로 실패했다. 동일 계열 실패가 세 번째 재발하여 자동 보완·재시도를 중단하고 backend를 `rules`로 복귀했다.

## 재현과 실제 결과

| 항목 | 기대 | 실제 |
|---|---|---|
| Compose 서비스 | frontend/backend/database 3개 | PASS |
| Secret | inline 금지, UID 1000·0400·read-only | PASS |
| adapter health/ready | `ok` / `ready` | PASS |
| 앱 service 추천 | 합성 자산만 추천 | PASS, 1건 |
| 앱 service OCR | fields·confidence 계약 | FAIL, provider HTTP 502 |
| 미인증 추천 API | 401 | rollback 후 deploy smoke에서 API 401 PASS |

## 원인 계층

`Qwen text model → llama.cpp response_format=json_object → OCR 자유 형식 출력 → fields/confidence 스키마 변동 → bridge fail-closed 502`

앞선 runtime 구축 과정에서도 OCR 출력의 추가 문자열과 평면 confidence 형식이 각각 발생했다. 이번에는 앱 service 경로에서 다시 계약을 벗어나 동일 계열 실패가 세 번째로 재발했다. 임의 정규화 규칙을 계속 추가하면 잘못된 OCR 결과를 정상처럼 받아들일 위험이 있어 중단했다.

## 최소 수정 후보

llama.cpp가 지원하는 strict JSON Schema 응답 계약을 OCR에 적용하고 다음 회귀 테스트를 먼저 통과시켜야 한다.

- fields는 object 필수
- confidence는 object 필수, 값은 0~1
- 추가 최상위 속성 거부
- schema 불일치·runtime 오류는 502 fail-closed
- strict schema 통과 후 external backend 연결은 한 번만 재검증

## Rollback 증거

- backend driver: `rules`
- AI Secret mount 제거
- backend health `ok`
- deploy smoke 5/5 PASS
- database ID `c30c3b7594dd`, frontend ID `49813e06cf13` 보존
- runtime/bridge 18767·18766은 healthy 상태로 유지
- SQCM-i OS models 37 / awake 8
- 보호 listener 1234/PID 6632, 11434/PID 8588, 18765/PID 22716 보존

## 다음 READY

`P3-OCR-STRUCTURED-OUTPUT-REMEDIATION-APPROVAL`: strict JSON Schema 구현·회귀 테스트 후 backend external 연결을 한 번만 재검증한다. 실패하면 추가 자동 재시도 없이 P3 OCR 공급자 결정을 HOLD로 유지한다.
