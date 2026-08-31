# P5-G1 Staging UAT Execution 실행계약

기준일: 2026-08-31

ROLE: SQCM-i 비품관리 staging의 역할별 UAT 실행자이자 증거 관리자다.

GOAL: 승인된 합성 fixture와 ADMIN·MANAGER·USER 시험계정으로 UAT 19개를 실제 staging에서 실행하고 API·브라우저·DB·provider receipt·결함 증거를 Secret 없이 고정한다.

SCOPE: 전용 Supabase staging의 합성 업무행, OIDC 세션, RBAC·scope·MFA, 승인·반납·구매·검수·수리·실사·CSV, Storage와 EICAR fixture, audit/outbox/provider receipt, live HTTPS 브라우저 관찰이다.

OUT OF SCOPE: Production, 실제 업무데이터, commit·push·merge·release, migration·DNS/TLS 변경, Secret 복사·출력, 기존 서비스 중단이다.

WORKFLOW: Harness 검사 → staging/보호 서비스 불변식 확인 → runId 격리 fixture 생성 → API·DB·provider 시험 → 브라우저 역할 화면 시험 → 결함 분류 → 증거 문서와 Harness를 동일 사실로 동기화 → P5-G2에서 중단한다.

INPUTS / SOURCE OF TRUTH: 사용자 승인, MASTER_ROADMAP, P5-G0 증거, UAT 체크리스트, live staging API·Supabase DB·provider 감사 로그·브라우저 실제 결과다.

AUTHORITY / PERMISSIONS: P5 staging에만 합성 fixture와 시험 세션을 생성할 수 있다. 로컬에서는 이 실행계약, 실행기, P5 증거·보고서·Harness 정본만 수정한다. 외부 자격증명은 보호 파일·컨테이너 경계를 유지한다.

CONSTRAINTS: 한 runId로 fixture를 식별하고 실제 데이터와 혼합하지 않는다. MFA 변경은 같은 실행에서 원복한다. 기존 dirty worktree, Docker 3서비스, 37봇과 보호 listener를 보존한다. 브라우저에 자격증명을 전송하기 직전에는 별도 확인을 받는다.

SUCCESS CRITERIA: 19개 시나리오가 관찰 가능한 증거로 PASS이고 Critical/High 결함 0, DB audit trace와 provider receipt가 존재하며 staging health·Docker·보호 listener가 보존된다.

FAILURE CRITERIA: 역할·scope·인증 경계 실패, 감염 fixture 저장, receipt·audit 누락, 열린 Critical/High, staging 또는 보호 서비스 변화다. 같은 원인이 3회면 중단한다.

VERIFICATION / EVIDENCE: `harness:status/check/verify`, `scripts/staging-uat-execution.mjs`, CA 검증 SQL, HTTPS status·headers, browser DOM·console, Docker health, 보호 listener PID와 기계 증거 JSON을 사용한다.

OUTPUTS / FORMAT: `P5_G1_STAGING_UAT_EXECUTION_EVIDENCE.json`, Phase 보고서, 체크리스트, Harness·roadmap·current-state를 같은 사실로 기록한다. Secret·이메일·토큰·세션 원문은 제외한다.

STOP CONDITION: 19개 실제 PASS 뒤 다음 READY를 `P5-G2-STAGING-UAT-SIGNOFF`로 전환하고 서명 없이 중단한다. 브라우저 자격증명 확인이나 실패가 있으면 G1을 유지하고 정확한 미완료만 보고한다.
