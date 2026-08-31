# P6-G0 Production Cutover Preflight 실행계약

기준일: 2026-08-31

ROLE: 코드→운영 8단계의 증거 공백을 fail-closed로 판정하는 Production 전환 준비도 검증자다.

GOAL: P3~P5 완료 이후 운영 대상·릴리스 Artifact·12개 cutover Gate·변경 시간·배포 권한의 실제 준비 상태를 비파괴로 확인하고 다음 외부 입력 한 건을 고정한다.

SCOPE:
- Git SHA·dirty baseline·main 불변 이미지·CI 증거
- 운영 결정표 8건, Production manifest, cutover evidence, self-hosted runner/workflow
- backup·migration·health/smoke·rollback·관측 입력과 변경 시간

OUT OF SCOPE:
- commit·push·merge·release, Production 배포·migration·DNS/TLS·Secret
- 운영 공급자·계정·runner 생성, 외부 메시지와 실제 데이터 변경

WORKFLOW:
1. Harness와 P3~P5 완료 증거를 확인한다.
2. 코드→운영 8단계별 실제 파일·Git·CI·Artifact 증거를 대조한다.
3. template preflight와 cutover gate가 fail-closed인지 실행한다.
4. 준비된 항목과 차단 입력을 JSON·보고서로 기록하고 다음 외부 입력 Gate에서 중단한다.

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자 승인과 장기 Goal+Harness
2. `MASTER_ROADMAP.json`, P2 remote evidence, P3~P5 Phase evidence
3. 실제 Git·workflow·manifest·cutover 파일과 로컬 검증 결과
충돌 시 실제 상태를 우선하되 승인·보안 요구사항을 낮추지 않는다.

AUTHORITY / PERMISSIONS:
- 읽기: 활성 저장소, Git, 로컬 workflow·운영 계약·증거
- 쓰기: P6-G0 실행계약·기계 증거·보고서·Harness·로드맵·현재 상태
- 외부 상태 변경: 없음. 모든 Production·Git 외부 변경은 정확한 후속 승인 전 금지한다.

CONSTRAINTS:
- template·staging 증거·HTTP 200을 Production 완료로 승격하지 않는다.
- 현재 dirty worktree를 보존하고 Secret 원문을 읽거나 기록하지 않는다.
- main의 불변 이미지가 현재 staging 변경을 포함한다고 추정하지 않는다.

SUCCESS CRITERIA:
- 운영 8단계의 PASS/HOLD와 증거 공백이 각각 관찰 가능한 근거를 가진다.
- template manifest와 cutover evidence가 배포를 정상 차단한다.
- READY가 정확히 하나이며 필요한 외부 대상·환경·입력이 명시된다.

FAILURE CRITERIA / STOP CONDITION:
- Production 실제 변경, Secret 노출, 보호 서비스 변화, 상태 정본 불일치가 발생하면 즉시 중단한다.
- 외부 target·change window·provider·release 입력이 없으면 `HOLD_EXTERNAL_INPUTS`로 끝내고 자동 배포하지 않는다.

VERIFICATION / EVIDENCE:
- `operations:preflight` template 차단, `operations:cutover-gate` 12 Gate 차단
- Git SHA·변경 수, Production manifest/cutover 파일 수, self-hosted workflow 수
- `npm.cmd run harness:status`, `npm.cmd run harness:check`, JSON·prompt 계약 검사

OUTPUTS / FORMAT:
- `agent docs/harness/P6_G0_PRODUCTION_CUTOVER_PREFLIGHT_EVIDENCE.json`
- `docs/phase-reports/120_P6_G0_Production_Cutover_Preflight.md`
- Harness·로드맵·현재 상태의 다음 READY 동기화
- Secret·토큰·세션·개인정보 원문은 제외한다.
