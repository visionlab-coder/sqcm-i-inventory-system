# Phase 89 — P3 G4 S4U Startup 및 Observability

기준일: 2026-08-25

## 판정

`OBSERVABILITY_PASS / S4U_TASK_REGISTRATION_BLOCKED_ACCESS_DENIED`

SYSTEM 대신 현재 사용자 S4U·AtStartup을 사용하는 최소권한 구성을 승인받아 구현했다. 실행계약, PowerShell parser, 구성 dry-run과 Secret-free observability 직접 실행은 통과했다. 그러나 기존 runtime task를 S4U로 등록하는 첫 단계에서 Windows Task Scheduler가 `액세스가 거부되었습니다`를 반환했다. 동일 등록을 재시도하지 않았고 이후 bridge·observability task 등록도 실행하지 않았다.

## 구현·검증 증거

| 항목 | 결과 |
|---|---|
| 실행계약 | strict 8/8 PASS |
| observability script | PowerShell parse PASS |
| S4U 구성 script | PowerShell parse·dry-run PASS |
| 직접 observability | runtime health, bridge health/ready, application health 모두 PASS |
| JSONL | `observability-20260825.jsonl`, schema v1, timestamp·status·latency·PID만 기록 |
| 민감정보 검사 | Authorization·Bearer·token·OCR text 패턴 0 |
| S4U task 등록 | 첫 runtime task에서 Access Denied |

## 실패 후 보존 증거

- runtime·bridge task는 기존 현재 사용자 Interactive·LogonTrigger·Running 상태
- observability scheduled task는 생성되지 않음
- runtime 18767/PID 28532, bridge 18766/PID 30392 보존
- backend `external`, container `81d9b84d4d68`, healthy
- database `c30c3b7594dd`, frontend `49813e06cf13`, healthy
- 보호 listener 1234/PID 6632, 11434/PID 8588, 18765/PID 22716 보존
- ACL·Secret·방화벽·migration·Production·Git 외부 변경 없음

## 원인과 다음 READY

현재 비관리자 token은 기존 task를 S4U·AtStartup으로 다시 등록할 Task Scheduler 권한이 없다. 구현 산출물과 직접 관측 기능은 준비됐지만 자동시작을 증명할 수 없으므로 G4는 완료하지 않는다.

다음 READY는 `P3-G4-ELEVATED-S4U-TASK-REGISTRATION`이다. Codex Desktop을 관리자 권한으로 다시 실행한 세션에서 준비된 구성 script를 적용하고, 수동 S4U 재기동 후 별도 승인된 reboot drill로 AtStartup을 최종 검증해야 한다.
