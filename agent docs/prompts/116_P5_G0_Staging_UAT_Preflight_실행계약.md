# P5-G0 Staging UAT Preflight 실행계약

기준일: 2026-08-31

ROLE: staging 인증·역할·시험데이터·감사·결함 계약 검증자다.

GOAL: ADMIN·MANAGER·USER 역할별 staging UAT 19개를 실제 실행하기 전에 계정, fixture 격리, 감사 추적과 결함 판정 기준이 모두 재현 가능함을 읽기 전용 증거로 고정한다.

SCOPE: Harness 계약, staging provider와 Docker health, Supabase application/Auth/OIDC 계정 1:1, 역할 범위, `P5-UAT-` fixture 충돌, audit trace schema, 19개 상태와 결함 기준이다.

OUT OF SCOPE: UAT 업무행 생성·수정·삭제, 실제 업무 데이터, 비밀번호·토큰 출력, Production, migration, DNS/TLS, commit·push·merge·release다.

WORKFLOW: Harness 시작 검사 → 현재 staging provider·Docker 확인 → CA 검증 read-only DB 계정·scope·audit 조회 → fixture 충돌 검사 → 19개·결함 계약 작성 → 문서·기계 상태 동기화 → 다음 Gate에서 중단한다.

INPUTS / SOURCE OF TRUTH: 현재 사용자 요청, MASTER_ROADMAP, UAT 체크리스트, live staging DB의 읽기 전용 결과, provider probe, Docker·listener 실제 상태다.

AUTHORITY / PERMISSIONS: 로컬 문서·Harness 증거만 수정한다. 원격 DB는 `BEGIN READ ONLY`와 `ROLLBACK`으로 조회하고 Supabase CA 검증을 유지한다. 다음 UAT 외부 쓰기와 서명은 별도 Gate다.

CONSTRAINTS: 기존 dirty worktree와 37봇·Docker 3서비스·보호 listener를 보존한다. 19개 항목은 실제 증거 전까지 PASS로 바꾸지 않고 계정·Secret·개인정보 원문을 산출물에 남기지 않는다.

SUCCESS CRITERIA: 세 계정이 역할·ACTIVE·확인 Auth·OIDC·조직/부서·scope 1:1이고 fixture 충돌 0, audit 컬럼·인덱스 2/2, UAT 항목 19개 READY, 열린 Critical/High 0, staging 3/3 healthy와 보호 PID 보존이다.

FAILURE CRITERIA: 계정·scope 불일치, 기존 fixture 충돌, 감사 추적 불가, 항목 수 불일치, Critical/High 존재, provider·Docker·보호 PID 변화다. 동일 원인이 3회면 재시도하지 않는다.

VERIFICATION / EVIDENCE: `harness:status/check/verify`, live provider probe, CA 검증 read-only SQL, Docker 3서비스, HTTPS health/readiness, listener PID와 JSON schema를 사용한다.

OUTPUTS / FORMAT: 기계 증거 JSON, 사람용 체크리스트 보고서, MASTER_ROADMAP·current-state·roadmap의 동일 READY를 기록하고 Secret·이메일·토큰 원문을 제외한다.

STOP CONDITION: 19개는 `READY_NOT_RUN`으로 유지하고 `P5-G1-STAGING-UAT-EXECUTION`에서 대기한다. 이 사전점검은 실제 UAT PASS나 서명을 대신하지 않는다.
