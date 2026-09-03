# Phase 90 — P3 G4 User Logon Observability

기준일: 2026-08-25

## 판정

`PASS_G4_USER_LOGON_OPERATING_MODE / P3_IN_PROGRESS`

사용자 승인에 따라 로그인 전 SYSTEM/S4U 부팅 모드를 제외하고, AI PC가 현재 사용자로 로그인된 뒤 자동운영하는 모드를 G4 기준으로 확정했다. 기존 runtime·bridge LogonTrigger는 수정하지 않고 일반 사용자 observability task 하나를 추가했다.

## 구성 증거

| 항목 | 결과 |
|---|---|
| task | `SQCMI-Inventory-AI-Observability` |
| principal | 현재 사용자 `Interactive`, `Limited` |
| triggers | 현재 사용자 LogonTrigger + 5분 반복 TimeTrigger |
| 중복 실행 | IgnoreNew |
| 실행 제한 | 3분 |
| task 직접 실행 | Ready 복귀, LastTaskResult 0 |
| 5분 반복 trigger | 17:20:22 자동 실행, LastTaskResult 0, 다음 17:25:22 |
| JSONL | `observability-20260825.jsonl`, 새 record 1건 |
| endpoint | runtime health, bridge health/ready, application health 모두 PASS |
| record | timestamp·status·httpStatus·latency·runtime/bridge PID만 포함 |
| 민감 패턴 | Authorization·Bearer·token·OCR text 0건 |

등록 직후 검사 wrapper가 오래된 PowerShell `$LASTEXITCODE`를 읽어 실패 메시지를 냈지만, task 등록 결과 `APPLIED`와 실제 Task Scheduler 정의를 직접 확인해 등록 성공으로 판정했다. task를 재등록하지 않고 한 번 실행해 결과 0을 확보했다. 이어 17:20:22의 첫 반복 trigger가 자동 실행되어 JSONL record가 2건에서 3건으로 증가했고 다음 실행 시각 17:25:22가 예약됐다.

## 회귀·보존 증거

- runtime task·bridge task는 기존 Interactive·LogonTrigger·Running 유지
- runtime 18767/PID 28532, bridge 18766/PID 30392 보존
- backend external·healthy, Docker 3서비스 보존
- 보호 listener 1234/PID 6632, 11434/PID 8588, 18765/PID 22716 보존
- Secret 원문·OCR 입력·Authorization 로그 없음
- SYSTEM·S4U·ACL·방화벽·migration·Production 변경 없음

## 운영 한계와 다음 READY

이 구성은 Windows 로그인 전에는 실행되지 않는다. AI PC가 현재 사용자로 로그인된 사무실 운용 조건에서만 G4 PASS다. 로그아웃 상태·부팅 직후 무인 운영은 보장하지 않는다.

G0~G4가 통과했고 P3의 남은 게이트는 실제 역할별 Pilot UAT인 G5다. 다음 READY는 `P3-G5-PILOT-UAT-ACTOR-ASSIGNMENT`이다.
