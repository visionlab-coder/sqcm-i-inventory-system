# P3 G4 SYSTEM Service 및 Observability 실행계약

## ROLE:

SQCM-i 비품관리 AI runtime·bridge의 최소권한 Windows 운영 서비스 검증자.

## GOAL:

재부팅 후 사용자 로그온 없이 runtime·bridge가 안전하게 시작되고, Secret 없는 health·ready 메트릭과 마스킹된 로그로 장애를 판정하며 기존 external backend 연결과 보호 서비스를 보존한다.

## SCOPE:

- runtime·bridge 자동시작 task/service의 계정·trigger·restart 정책
- SYSTEM 실행 경로의 코드·config·Secret·로그 ACL과 변경 방지
- loopback health/ready, 상태·지연·PID·시각만 기록하는 observability
- 실패 시 기존 current-user tasks와 정상 PID로 복구
- Harness·로드맵·P3 보고서 갱신

## OUT OF SCOPE:

- 관리자 권한 우회, UAC 자동 동의 또는 자격증명 저장
- 사용자 쓰기 가능한 repository 코드를 SYSTEM으로 직접 실행
- 보호 포트 1234·11434·18765 변경
- frontend·database 재생성, migration·Production, 외부 경보 발송
- OCR 본문·Authorization·Secret·개인정보 로그 기록

## WORKFLOW:

1. 현재 권한, task XML, action·principal·trigger, ACL과 listener/PID를 읽기 점검한다.
2. SYSTEM 실행이 가능한 관리자 권한과 사용자 쓰기 불가 서비스 artifact 경로를 확인한다.
3. 두 조건이 모두 충족될 때만 rollback 가능한 task/service와 observability를 구성한다.
4. runtime→bridge 순서로 시작하고 loopback health·ready와 마스킹 로그·메트릭을 검증한다.
5. backend external provider, Docker 3서비스, smoke와 보호 PID를 재검증한다.
6. 실패하면 원래 current-user task 정의와 정상 프로세스로 복귀한다.

## INPUTS / SOURCE OF TRUTH:

1. 사용자 승인 `P3-G4-SYSTEM-SERVICE-OBSERVABILITY-APPROVAL`
2. 실제 Windows identity/token, scheduled task, filesystem ACL과 live listener
3. P3 runtime evidence, Phase 84·87 보고서와 현재 repository code

## AUTHORITY / PERMISSIONS:

- 읽기: task·process·ACL·repository·runtime·loopback endpoints
- 쓰기: 승인된 hardened service artifact, SYSTEM task/service, 로컬 Secret-free metrics/log, rollback
- 금지: 권한 우회, 비밀번호·토큰 노출, 보호 서비스·DB·Production·Git 외부 변경

## SUCCESS CRITERIA:

- 관리자 권한으로 사용자 쓰기 불가 artifact를 SYSTEM 또는 승인된 동등 최소권한 계정이 실행한다.
- 부팅 trigger·restart policy와 runtime→bridge readiness 순서가 증명된다.
- 메트릭·로그에 상태·지연·PID·timestamp만 있고 Secret·OCR text가 없다.
- backend external·3서비스·smoke와 보호 PID가 모두 보존된다.

## FAILURE CRITERIA / STOP CONDITION:

- 현재 프로세스가 관리자 권한이 아니거나 SYSTEM 실행 경로가 사용자 수정 가능하다.
- UAC·자격증명·보호 서비스 변경이 필요하다.
- health/ready·rollback 또는 로그 마스킹을 증명하지 못한다.
- 실패 시 변경하지 않거나 즉시 복구하고 자동 재시도 없이 중단한다.

## VERIFICATION / EVIDENCE:

- WindowsPrincipal 관리자 여부, task principal/trigger/action/settings
- `Get-Acl`의 SYSTEM·Administrators·운영자 최소 ACL과 상속 차단
- listener/PID, health/ready latency, scheduled task history/last result
- 로그 민감정보 검사, backend provider·deploy smoke·Harness check

## OUTPUTS / FORMAT:

- 관리자/보안 조건 판정과 재개 Gate
- `docs/phase-reports/88_P3_G4_SYSTEM_Service_Observability_사전점검.md`
- `P3_RUNTIME_EVIDENCE.json`, `MASTER_ROADMAP.json`, current-state·roadmap 갱신
