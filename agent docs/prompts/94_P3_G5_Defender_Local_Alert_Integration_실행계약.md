# P3 G5 Defender Local Alert Integration 실행계약

기준일: 2026-08-25

ROLE:
SQCM-i 비품관리 시스템의 로컬 데이터 경계형 malware 검사·경보 통합 실행자다.

GOAL:
Microsoft Defender Antivirus와 인증된 P3 bridge를 실제 malware scanner로 연결하고, 현재 사용자 Windows 세션에 감사 가능한 경보를 전달하여 P3 G5 UAT-15·16을 증거로 판정한다.

SCOPE:
- `src/bridge/`, `src/adapters/`, bridge 실행 스크립트와 focused test
- `compose.ai.yaml`의 backend 전용 외부 scanner 설정
- `D:\seowon_runtime\sqcmi-inventory-ai`의 bridge 비밀값이 아닌 provider 설정·감사 로그
- 합성 EICAR PDF, unknown 응답, timeout 실패 주입과 경보 receipt 검증
- 관련 P3 G5 Harness·로드맵·Phase 보고서

OUT OF SCOPE:
- 회사 파일 또는 개인정보의 외부 클라우드 전송
- 신규 외부 계정·OAuth·유료 구독·Telegram bot 생성
- Microsoft Defender 제외 경로·실시간 보호·방화벽·시그니처 업데이트 설정 변경
- database·frontend 재생성, 운영 배포, migration, P4 진입
- commit, push, merge, release, broad staging, reset, clean

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자의 “권장하는 대로 채워 넣어 진행” 승인
2. `MASTER_ROADMAP.json`의 `P3-G5-EXTERNAL-PROVIDER-INPUT`
3. 실제 Microsoft Defender 상태·버전, bridge 구성·인증과 코드 계약
4. P3 G5 UAT 증거와 실제 Docker·PID·HTTP 결과
충돌 시 위 순서를 따르며 Secret 원문과 시험 파일 내용은 기록하지 않는다.

WORKFLOW:
1. Harness·Git·보호 PID·Docker 3서비스·Defender 기준선을 기록한다.
2. 로컬 데이터 경계와 최소권한에 대한 integration preflight를 판정한다.
3. Defender scan과 Windows 세션 alert receipt를 bridge에 최소 추가하고 backend HTTP adapter를 연결한다.
4. unit/focused 검증 후 bridge 한 번, backend 한 번만 재연결한다.
5. clean·infected·unknown·timeout, 저장 차단, alert receipt, health/readiness를 검증한다.
6. 실패 시 backend 이전 이미지와 bridge 이전 설정으로 복구하고 동일 원인 3회 시 중단한다.
7. 모든 G5 증거가 충족된 경우에만 Harness·로드맵을 동기화한다.

AUTHORITY / PERMISSIONS:
- 읽기: 활성 저장소, Defender 상태, P3 runtime 설정 참조, Docker·PID·HTTP·로그
- 로컬 쓰기: 위 SCOPE 파일, P3 runtime의 비밀값 아닌 설정·scan 임시 폴더·alert audit
- 프로세스 변경: 기존 예약 작업을 이용한 P3 bridge 1회 reload와 backend 단독 1회 recreate
- 외부 전송: 금지. 합성 시험 데이터도 localhost/host.docker.internal 경계를 벗어나지 않는다.
- Secret: 기존 bridge key-file reference만 재사용하고 원문을 출력·복사·저장소 기록하지 않는다.

CONSTRAINTS:
- LM Studio 1234, Ollama 11434, 기존 bridge/wslrelay 18765와 P3 runtime 18767을 중단하지 않는다.
- Compose 서비스는 frontend/backend/database 정확히 3개이며 frontend·database ID를 보존한다.
- Defender 실시간 보호·제외·시그니처 정책을 변경하지 않는다.
- child process는 shell 없이 고정 executable과 argument 배열로 호출한다.
- scan 임시 파일은 전용 폴더에 만들고 성공·실패 후 제거한다.

SUCCESS CRITERIA:
- Defender engine·signature가 실제 health 응답에 기록되고 clean은 허용된다.
- 합성 EICAR PDF는 infected로 판정되어 HTTP 422이며 저장소·DB에 생성되지 않는다.
- unknown과 timeout은 fail-closed되고 각각 경보 receipt와 감사 레코드를 가진다.
- P3 G5가 19/19 PASS, FAIL 0, 승인 3/3이 되고 보호 PID·Docker 3서비스가 보존된다.

FAILURE CRITERIA / STOP CONDITION:
- Defender 비활성·오래된 상태, Secret 노출, 검사 오류의 clean 오판, 경보 receipt 부재는 실패다.
- frontend/database 또는 보호 PID가 변경되면 즉시 중단하고 안전한 범위에서 복구한다.
- bridge/backend 재연결 후 health·smoke가 실패하면 이전 설정·이미지로 복구한다.
- 동일 원인이 3회 반복되면 자동 재시도하지 않는다.

VERIFICATION / EVIDENCE:
- prompt strict 8/8, JavaScript syntax, focused unit/integration
- Defender engine/signature health, clean/EICAR/unknown/timeout 결과
- alert receipt ID와 민감정보 없는 JSONL audit
- `npm.cmd run check`, `npm.cmd run deploy:smoke`, `npm.cmd run harness:check`, repository hygiene, scoped diff check
- Docker exact 3, backend digest, frontend/database ID, 보호 listener/PID

OUTPUTS / FORMAT:
- 구현 코드·focused test
- `agent docs/harness/P3_G5_SECURITY_PROVIDER_EVIDENCE.json`
- `docs/phase-reports/94_P3_G5_Defender_Local_Alert_Integration.md`
- 동기화된 P3 G5 UAT·runtime·Master Roadmap·current-state·roadmap
- Secret·시험 payload·개인정보 원문은 모든 산출물에서 제외한다.
