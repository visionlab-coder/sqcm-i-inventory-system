# P3 G4 User Logon Observability 실행계약

## ROLE:

SQCM-i 비품관리 AI의 현재 사용자 로그인 기반 관측 구성자.

## GOAL:

기존 runtime·bridge 로그인 자동시작을 유지하면서 현재 사용자 권한의 observability task가 로그인 시와 5분마다 Secret-free health·ready 메트릭을 기록하게 한다.

## SCOPE:

- `SQCMI-Inventory-AI-Observability` 현재 사용자 Interactive task 1개
- 현재 사용자 LogonTrigger와 5분 반복 trigger
- 기존 observability script의 JSONL·민감정보 비노출 검증
- backend external·3서비스·보호 PID 보존과 G4 사용자 로그인 모드 판정

## OUT OF SCOPE:

- 기존 runtime·bridge task 수정·재시작
- S4U·SYSTEM·AtStartup·관리자 권한·UAC
- 실제 로그오프·재부팅, 외부 경보, Secret·OCR 본문 로그
- frontend·database 재생성, migration·Production, Git 외부 변경

## WORKFLOW:

1. 기존 task·PID·container와 observability task 부재를 확인한다.
2. 일반 사용자 task 구성 script를 구현하고 parse·dry-run을 통과시킨다.
3. observability task 하나만 등록하고 즉시 한 번 실행한다.
4. task principal·trigger·5분 반복·LastTaskResult와 새 JSONL을 확인한다.
5. backend·smoke·3서비스·보호 PID·Harness를 검증한다.
6. 실패하면 새 task를 제거하거나 원본 XML을 복구하고 재시도 없이 중단한다.

## INPUTS / SOURCE OF TRUTH:

1. 사용자 승인 `P3-G4-USER-LOGON-OBSERVABILITY 승인`
2. 실제 current-user tasks, listener, observability code와 JSONL
3. P3 Runtime Evidence와 Phase 89 보고서

## AUTHORITY / PERMISSIONS:

- 읽기: task·process·logs·repository·runtime·loopback endpoints
- 쓰기: 현재 사용자 observability task와 Secret-free JSONL, allowlist docs/Harness
- 금지: runtime·bridge·보호 서비스·DB·Production·Git 외부 변경

## SUCCESS CRITERIA:

- observability task가 현재 사용자 Interactive·LogonTrigger·5분 반복으로 등록된다.
- task 실행 결과 0과 네 endpoint PASS JSONL이 새로 기록된다.
- 로그 민감 패턴 0, backend external·3서비스·smoke·보호 PID 보존이 확인된다.

## FAILURE CRITERIA / STOP CONDITION:

- 일반 사용자 task 등록 또는 실행이 Access Denied/실패한다.
- JSONL endpoint 상태가 FAIL이거나 민감정보가 포함된다.
- 기존 runtime·bridge·backend·보호 서비스가 변경된다.
- 실패 시 새 task를 rollback하고 자동 재시도 없이 HOLD한다.

## VERIFICATION / EVIDENCE:

- prompt strict validator, PowerShell parser·dry-run
- task principal/action/triggers/repetition/LastTaskResult
- JSONL latest record, 민감 패턴 검사, npm check·hygiene·smoke·Harness
- before/after listener PID와 container ID

## OUTPUTS / FORMAT:

- `scripts/configure-inventory-ai-user-observability.ps1`
- `docs/phase-reports/90_P3_G4_User_Logon_Observability.md`
- P3 Runtime Evidence·roadmap와 다음 G5 READY
