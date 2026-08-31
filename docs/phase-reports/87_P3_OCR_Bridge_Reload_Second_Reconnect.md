# Phase 87 — P3 OCR Bridge Reload 및 두 번째 재연결

기준일: 2026-08-25

## 판정

`P3_G3_PASS / P3_IN_PROGRESS`

승인된 범위에서 독립 bridge scheduled task를 한 번 reload하고 backend를 두 번째로 한 번만 external adapter에 재연결했다. 새 OCR schema가 bridge와 애플리케이션 provider 경로 모두에서 합성 입력으로 통과했다. P3 G3는 PASS로 전환하지만 G4·G5가 남아 P3 전체와 3/8 로드맵 진행률은 완료 처리하지 않는다.

## 실행 증거

| 항목 | 결과 |
|---|---|
| 실행계약 | strict 8/8 PASS |
| focused OCR·bridge | 8/8 PASS |
| bridge reload | scheduled task stop/start 1회, PID `11232 → 30392` |
| bridge listener | `127.0.0.1:18766`, health `ok`, ready `ready` |
| bridge 인증 역조건 | 미인증 ready HTTP 401 |
| bridge 추천 | 합성 입력 asset ID 7 안에서 1건 PASS |
| bridge OCR | `assetNumber/manufacturer/productName` fields·confidence 동일 key PASS |
| backend 두 번째 재연결 | container `81d9b84d4d68`, external, healthy |
| backend provider | health·ready·추천·OCR 모두 PASS |
| Secret | volume read-only, `/run/secrets/ai_provider_api_key`, `0400`, UID/GID 1000 |
| external preflight | health/readiness HTTP 200, recommend/OCR host 127.0.0.1:18766 |

## 회귀·보존 증거

- JavaScript 구문 101개, 단위 117/117 PASS
- repository hygiene PASS
- deploy smoke 5/5 PASS, 익명 `/api/items` 401 포함
- Docker는 frontend/backend/database 정확히 3서비스, 모두 healthy
- database `c30c3b7594dd`, frontend `49813e06cf13` 보존
- runtime 18767/PID 28532 보존
- 보호 listener 1234/PID 6632, 11434/PID 8588, 18765/PID 22716 보존
- SQCM-i snapshot models 37 / awake 8
- Git stage·commit·push·migration·Production 변경 없음

## 남은 게이트와 다음 READY

- G4: current-user logon scheduled task는 있으나 SYSTEM 수준 자동 시작·운영 로그/메트릭 완료 증거가 없다.
- G5: 실제 역할별 Pilot UAT와 책임자 승인이 없다.

다음 READY는 `P3-G4-SYSTEM-SERVICE-OBSERVABILITY-APPROVAL`이다. 해당 승인 전에는 현재 external 연결을 유지하되 P3를 완료 처리하지 않는다. rollback image `seowon-inventory-backend:p3-pre-ocr`와 rules 복귀 경로는 보존한다.
