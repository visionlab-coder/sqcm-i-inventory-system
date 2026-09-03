# P3 OCR Bridge Reload 및 두 번째 재연결 실행계약

## ROLE:

SQCM-i 비품관리 시스템 P3 OCR 활성화 검증자.

## GOAL:

승인된 독립 bridge를 한 번 reload하여 새 OCR schema adapter를 실제 프로세스에 적용하고, backend external adapter를 두 번째로 한 번만 재연결해 합성 OCR end-to-end 성공을 증명한다.

## SCOPE:

- `SQCMI-Inventory-AI-Bridge` scheduled task의 1회 stop/start와 PID 변경 확인
- bridge health·ready·인증·추천·text-only 합성 OCR 확인
- 기존 검증된 backend image로 backend만 external 재연결
- 애플리케이션 provider health·ready·추천·text-only OCR, smoke와 보존 검증
- Harness·로드맵·Phase 보고서 갱신

## OUT OF SCOPE:

- runtime 18767, 보호 포트 1234·11434·18765 또는 해당 PID 변경
- frontend·database 재생성, 네 번째 Docker 서비스, migration·Production
- 실제 비품·개인정보 전송, Git stage·commit·push·merge·release
- P3의 G4·G5를 증거 없이 완료 처리

## WORKFLOW:

1. dirty worktree, 세 컨테이너 ID, 보호 listener/PID, bridge/runtime 상태를 기록한다.
2. 실행계약과 OCR focused/전체 검증을 확인한다.
3. scheduled task로 bridge를 정확히 한 번 stop/start하고 새 PID·health·ready를 확인한다.
4. Secret 원문을 출력하지 않고 bridge에 인증된 추천과 text-only 합성 OCR을 호출한다.
5. bridge가 통과한 경우에만 backend를 compose AI override로 두 번째 한 번 재연결한다.
6. 컨테이너 내부 실제 provider health·ready·추천·text-only OCR을 검증한다.
7. 3-service health, smoke, frontend/database ID와 보호 PID 보존을 확인한다.
8. 실패하면 backend를 `p3-pre-ocr` image·rules driver로 즉시 복귀하고 추가 재시도 없이 중단한다.

## INPUTS / SOURCE OF TRUTH:

1. 사용자 승인 `P3-OCR-BRIDGE-RELOAD-AND-SECOND-RECONNECT-APPROVAL 승인`
2. 실제 scheduled task·listener·container·code·test 상태
3. `MASTER_ROADMAP.json`, `P3_RUNTIME_EVIDENCE.json`, Phase 86 보고서

## AUTHORITY / PERMISSIONS:

- 읽기: 현재 repository, Docker, scheduled task, loopback endpoints와 보호 상태
- 쓰기: bridge 1회 reload, backend 1회 재연결·필요 시 rules rollback, allowlist 문서·Harness
- 금지: runtime·보호 서비스·frontend·database·운영·migration·Git 외부 상태 변경

## SUCCESS CRITERIA:

- bridge PID가 한 번 교체되고 18766 health·ready·인증·추천·OCR가 통과한다.
- backend application provider의 health·ready·추천·OCR가 통과한다.
- Docker 3서비스 healthy, frontend/database ID와 보호 PID가 보존된다.
- deploy smoke 5/5, Harness check와 repository hygiene가 통과한다.

## FAILURE CRITERIA / STOP CONDITION:

- bridge reload 또는 새 프로세스 OCR이 실패한다.
- backend 두 번째 재연결·provider 검증·smoke가 실패한다.
- 보호 PID나 frontend/database가 변경된다.
- 실패 시 rules rollback 후 자동 재시도 없이 HOLD한다.

## VERIFICATION / EVIDENCE:

- prompt strict validator, focused/전체 Node 검사와 hygiene
- scheduled task state, listener/PID, authenticated loopback HTTP 결과
- Compose services/container/image/secret mount와 container 내부 provider 결과
- deploy smoke, SQCM-i 37봇 snapshot, protected listener/PID, Harness check

## OUTPUTS / FORMAT:

- `docs/phase-reports/87_P3_OCR_Bridge_Reload_Second_Reconnect.md`
- `P3_RUNTIME_EVIDENCE.json`, `MASTER_ROADMAP.json`, current-state와 roadmap
- P3 G3 판정, 남은 G4·G5와 다음 READY 1건
