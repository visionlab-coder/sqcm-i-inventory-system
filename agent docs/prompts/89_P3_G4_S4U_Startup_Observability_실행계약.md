# P3 G4 S4U Startup 및 Observability 실행계약

## ROLE:

SQCM-i 비품관리 AI runtime·bridge의 최소권한 Windows 자동시작 구현자.

## GOAL:

SYSTEM 권한 없이 현재 사용자 S4U task가 부팅 시 runtime·bridge를 시작하고, 5분 주기 Secret-free 관측 결과를 로컬 JSONL로 남기는 구성을 만들며 수동 S4U 재기동 증거를 확보한다.

## SCOPE:

- 기존 runtime·bridge task를 현재 사용자 S4U·AtStartup으로 전환하고 LogonTrigger fallback 유지
- health·ready·PID·latency·timestamp만 기록하는 observability script와 5분 주기 S4U task
- 기존 task XML 기반 rollback과 수동 task 재기동 검증
- backend external·Docker 3서비스·보호 PID 회귀 검증
- Harness·로드맵·P3 보고서 갱신

## OUT OF SCOPE:

- SYSTEM·관리자 권한, UAC, 자격증명 저장 또는 외부 경보 발송
- 실제 Windows 재부팅, 보호 포트 1234·11434·18765 변경
- OCR 본문·Secret·Authorization·개인정보 로그
- frontend·database 재생성, migration·Production, Git 외부 변경

## WORKFLOW:

1. task XML·PID·container와 dirty worktree를 기록한다.
2. observability와 S4U 구성 script를 구현하고 dry-run·parse·민감정보 검사를 통과시킨다.
3. 원본 XML을 메모리에 보존한 채 runtime·bridge·observability task를 S4U startup으로 등록한다.
4. runtime→bridge를 task로 수동 재기동하고 health·ready·external OCR을 확인한다.
5. observability task를 실행해 JSONL schema와 Secret 비노출을 확인한다.
6. backend provider, smoke, 3서비스와 보호 PID를 검증한다.
7. 실패하면 원본 task XML을 복구하고 추가 재시도 없이 중단한다.

## INPUTS / SOURCE OF TRUTH:

1. 사용자 승인 `P3-G4-S4U-STARTUP-OBSERVABILITY 승인`
2. 실제 scheduled task XML·listener·ACL·code·container 상태
3. P3 Runtime Evidence와 Phase 88 사전점검

## AUTHORITY / PERMISSIONS:

- 읽기: repository, runtime, tasks, ACL, listener, loopback endpoints
- 쓰기: 현재 사용자 소유 S4U tasks 3개, observability JSONL, allowlist code/docs/Harness
- 금지: SYSTEM·보호 서비스·DB·Production·Git 외부 상태 변경과 Secret 출력

## SUCCESS CRITERIA:

- 세 task principal이 현재 사용자 S4U이고 AtStartup trigger가 존재한다.
- runtime·bridge task 수동 재기동 후 health·ready·OCR가 PASS한다.
- observability JSONL에 상태·지연·PID·timestamp만 있으며 네 endpoint가 PASS한다.
- backend external, 3서비스 healthy, smoke와 보호 PID가 보존된다.

## FAILURE CRITERIA / STOP CONDITION:

- S4U·AtStartup 등록 권한이 없거나 task start가 실패한다.
- 관측 로그에 Secret·본문·Authorization이 포함된다.
- runtime·bridge·backend 또는 보호 상태가 깨진다.
- 실패 시 원래 task XML로 복구하고 자동 재시도 없이 HOLD한다.

## VERIFICATION / EVIDENCE:

- prompt strict validator, PowerShell parser, configure dry-run
- task principal/logon type/triggers/settings/last result
- listener PID, health·ready·OCR와 observability 최신 JSONL
- 민감정보 패턴 검사, npm check, deploy smoke, Harness check

## OUTPUTS / FORMAT:

- `scripts/inventory-ai-observability.ps1`
- `scripts/configure-inventory-ai-s4u.ps1`
- `docs/phase-reports/89_P3_G4_S4U_Startup_Observability.md`
- P3 evidence·roadmap와 다음 reboot drill Gate
