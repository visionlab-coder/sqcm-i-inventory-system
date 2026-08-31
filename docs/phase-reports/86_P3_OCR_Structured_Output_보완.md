# Phase 86 — P3 OCR Structured Output 보완

기준일: 2026-08-25

## 판정

`CODE_AND_DIRECT_RUNTIME_PASS / APP_ACTIVATION_HOLD / RULES_ROLLBACK_PASS`

OCR의 완화 변환을 제거하고 llama.cpp 공식 schema-constrained JSON 형식과 애플리케이션 fail-closed 검증을 구현했다. 새 adapter의 실 runtime 합성 OCR은 통과했다. 그러나 승인된 backend 1회 재연결 후 검증 입력의 `fileId`에 문자열을 사용해 bridge가 runtime 호출 전에 HTTP 400으로 거부했다. 계약상 재시도하지 않고 이전 backend 이미지와 `rules` driver로 즉시 복귀했다.

## 구현과 검증

| 항목 | 결과 |
|---|---|
| 실행계약 | strict 8/8 PASS |
| llama.cpp 형식 | `response_format.type=json_object` + `schema` |
| 최상위 계약 | `fields`, `confidence` 필수·추가 속성 금지 |
| adapter 재검증 | 동일 key, 문자열 field, confidence 0~1, 불일치 fail-closed |
| focused 테스트 | 8/8 PASS |
| 전체 로컬 검사 | 구문 101, 단위 117/117 PASS |
| repository hygiene | PASS |
| 새 adapter → 실 runtime OCR | PASS, field/confidence 동일 3 keys |
| backend image build | PASS, 새 image `sha256:89188f…` |
| backend 1회 재연결 | healthy, container `3bb6cf4b7db0` |
| 애플리케이션 provider 검증 | HOLD, 합성 `fileId` 형식 오류로 HTTP 400 |

HTTP 400은 기존 OCR schema 502의 재발 증거가 아니다. bridge의 `fileId` 계약은 양의 정수인데 검증기가 `synthetic-p3-ocr` 문자열을 보냈고, 요청은 runtime에 도달하기 전에 거부됐다. 또한 실행 중인 bridge PID 11232는 코드 변경 전에 시작되어 새 adapter를 아직 reload하지 않았다. 따라서 새 schema의 backend end-to-end 성공을 주장하지 않는다.

## Rollback과 보존 증거

- backend: 이전 image `sha256:4dda021e…`, `AI_PROVIDER_DRIVER=rules`, container `b4329c7c99d0`, healthy
- database `c30c3b7594dd`, frontend `49813e06cf13` 보존·healthy
- AI Secret mount 제거, upload mount만 유지
- deploy smoke 5/5 PASS
- SQCM-i snapshot models 37 / awake 8
- 보호 listener 1234/PID 6632, 11434/PID 8588, 18765/PID 22716 보존
- 독립 bridge 18766/PID 11232, runtime 18767/PID 28532 보존

## 남은 위험과 다음 READY

P3는 완료하지 않는다. 다음 READY는 `P3-OCR-BRIDGE-RELOAD-AND-SECOND-RECONNECT-APPROVAL`이다. 새 adapter를 적용하기 위한 bridge 1회 reload와 정수 `fileId` 또는 text-only 합성 입력을 사용한 backend 두 번째 재연결 승인이 필요하다. 승인 전에는 현재 rules 기준선을 유지한다.
