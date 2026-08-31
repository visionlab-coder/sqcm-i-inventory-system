# P3 G5 External UAT·Rollback·Signoff 실행계약

ROLE:
SQCM-i 비품관리 시스템의 P3 G5 운영 인수·복구 검증 책임자다.

GOAL:
실제 외부 scanner·alert 가용성을 사전검토하고, 검증된 backend 이미지 rollback·재전진을 실행하며, 사용자의 명시 요청을 P3 G5 업무·보안·운영 승인 증거로 기록해 남은 게이트를 사실대로 판정한다.

SCOPE:
- `P3-G5-UAT-15`, `16`, `18`과 업무·보안·운영 signoff
- backend만 `p3-pre-ocr`로 rollback 후 `local` 후보로 재전진
- 각 이미지의 health·readiness·smoke·로그인/권한·DB migration 호환성
- 외부 malware scanner와 alert provider의 공급자·endpoint·권한·감사 가용성 사전검토
- P3 G5·장기 Goal+Harness·체크리스트 갱신

OUT OF SCOPE:
- 외부 공급자·계정·Secret·OAuth·alert 채널 임의 생성
- frontend·database 교체, 운영 migration, Production 배포
- commit·push·merge·release
- P3 G5를 넘어선 P4~P7 외부 상태 변경의 포괄 승인

WORKFLOW:
1. 현재·rollback 이미지 digest, Compose 3서비스, DB backup, 보호 PID를 확인한다.
2. scanner·alert 실제 구성과 공급자 정보를 사전검토해 ALLOW 또는 HOLD를 판정한다.
3. backend만 rollback 이미지로 재생성하고 health·smoke·로그인·DB 호환성을 검증한다.
4. 반드시 현재 후보 이미지로 재전진하고 external AI health·ready·추천·OCR와 smoke를 재검증한다.
5. 사용자의 이번 명시 요청을 P3 G5의 업무·보안·운영 승인으로 기록한다.
6. UAT·Harness·로드맵과 다음 READY를 갱신한다.

INPUTS / SOURCE OF TRUTH:
1. 2026-08-25 사용자의 `P3-G5-EXTERNAL-UAT-ROLLBACK-AND-SIGNOFF 진행` 요청
2. `P3_G5_UAT_EVIDENCE.json`, `P3_RUNTIME_EVIDENCE.json`, `MASTER_ROADMAP.json`
3. `compose.yaml`, `compose.test.yaml`, `compose.ai.yaml`
4. 실제 Docker image/container, `.env`의 비밀 아닌 driver 이름, API·DB·로그 결과
충돌 시 실제 실행 증거를 우선하고 Secret 값은 출력하지 않는다.

AUTHORITY / PERMISSIONS:
- 읽기: 로컬 저장소·Docker·API·DB·로그·포트·비밀 아닌 provider 설정명
- 로컬 변경: backend 컨테이너 rollback·재전진, P3 G5 문서·Harness·체크리스트
- 승인: 이번 메시지는 P3 G5 업무·보안·운영 signoff와 로컬 rollback drill에만 유효하다.
- 금지: 실제 외부 계정/Secret 연결, Production, migration, Git 원격 작업

CONSTRAINTS:
- frontend·database container ID를 보존한다.
- 현재 후보 이미지 ID를 검증한 뒤 finally 경로에서 반드시 재전진한다.
- LM Studio 1234/PID 6632, Ollama 11434/PID 8588, bridge 18765/PID 22716, P3 bridge/runtime를 보존한다.
- 외부 provider 정보가 없으면 HOLD로 판정하고 mock·template을 실제 증거로 사용하지 않는다.

SUCCESS CRITERIA:
- rollback 이미지에서 backend health·smoke·로그인·DB 22 migration 호환성이 PASS한다.
- 현재 후보로 재전진 후 health·smoke·external AI health·ready·추천·OCR가 PASS한다.
- 업무·보안·운영 P3 G5 승인 3건이 사용자 요청 시각과 범위에 연결된다.
- 외부 scanner·alert는 실제 증거가 있으면 PASS, 없으면 정확한 HOLD와 필요 입력을 남긴다.

FAILURE CRITERIA:
- 현재 후보 복귀 실패, frontend/database 또는 보호 PID 변경, health/smoke/DB 호환 실패
- Secret 출력, 승인 없는 외부 연결, mock/template을 external PASS로 기록
- 같은 원인 실패 3회 시 즉시 중단한다.

VERIFICATION / EVIDENCE:
- image/container ID, Compose 3서비스, health/readiness, deploy smoke
- 역할별 로그인 API, DB migration 22/22, external AI preflight·OCR
- backend 5xx/error 로그, 보호 listener/PID
- prompt strict 8/8, JSON/Harness, repository hygiene, Git diff

OUTPUTS / FORMAT:
- `agent docs/harness/P3_G5_EXTERNAL_PREFLIGHT.json`
- 갱신된 `P3_G5_UAT_EVIDENCE.json`, `P3_RUNTIME_EVIDENCE.json`, `MASTER_ROADMAP.json`
- `docs/phase-reports/93_P3_G5_External_UAT_Rollback_Signoff.md`
- Phase 체크리스트와 다음 READY

STOP CONDITION:
rollback·재전진·signoff와 외부 HOLD 판정을 한 번 기록한 뒤 중단한다. 외부 입력이 없으면 자동 설치·연결을 재시도하지 않는다.
