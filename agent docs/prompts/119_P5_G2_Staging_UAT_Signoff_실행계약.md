# P5-G2 Staging UAT Signoff 실행계약

기준일: 2026-08-31

ROLE: P5 staging UAT 증거와 사용자 전자승인을 대조해 Phase 완료를 판정하는 실행 관리자다.

GOAL: 기술 UAT 19/19, Critical/High 0과 현재 사용자의 명시 승인을 근거로 업무·보안·운영 책임자를 동일한 현재 사용자로 지정하고 P5 서명 3/3을 증거화한다.

SCOPE:
- P5 staging UAT 업무·보안·운영 책임자 지정과 전자승인 증거
- P5 Phase 완료 체크리스트, Harness, 로드맵과 현재 상태 동기화
- P6 첫 비파괴 preflight READY 설정

OUT OF SCOPE:
- Production 배포·migration·DNS/TLS·Secret·운영 계정 변경
- commit·push·merge·release, 외부 메시지와 실제 업무 데이터 생성

WORKFLOW:
1. Harness와 P5 기술 UAT 19/19·결함 0 증거를 재확인한다.
2. 승인 문구의 주체·환경·역할 3건과 시간·범위를 Secret 없이 기록한다.
3. P5 완료 7개 체크 항목을 검증하고 기계·사람 상태를 6/8로 동기화한다.
4. P6를 유일한 진행 Phase로 열되 Production 변경은 실행하지 않는다.

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자의 `P5-G2 staging UAT 업무·보안·운영 책임자를 나로 지정하고 3건 실제 서명 승인`
2. P5-G1 remediation·browser evidence와 UAT checklist
3. Harness, 실제 HTTPS·Docker·listener 상태
충돌 시 위 순서를 따르며 오래된 Phase 보고서보다 현재 실행 증거를 우선한다.

AUTHORITY / PERMISSIONS:
- 읽기: 활성 저장소, staging health/readiness, Docker와 보호 listener
- 쓰기: P5-G2 증거·보고서·체크리스트·Harness·로드맵·현재 상태
- 외부 상태 변경: 없음. 이번 서명은 P5 staging에만 유효하며 Production 승인이 아니다.

CONSTRAINTS:
- 동일한 현재 사용자가 세 책임을 겸임한다는 이번 명시 승인만 기록하고 실명·개인정보를 추정하지 않는다.
- 기존 dirty worktree와 P3~P5 증거를 reset·clean·stage하지 않는다.
- `productionGo=false`를 유지하고 P5 승인 범위를 P6로 확대하지 않는다.

SUCCESS CRITERIA:
- P5 UAT 19 PASS·0 FAIL·0 PENDING, Critical/High 0
- 업무·보안·운영 전자서명 3/3과 책임자 `PROJECT_OWNER_CURRENT_USER` 기록
- P5 `evidence-complete`, P6 `in-progress`, 전체 6/8, READY 정확히 1건
- health/readiness 200, staging Docker 3/3 healthy, 보호 listener 보존

FAILURE CRITERIA / STOP CONDITION:
- UAT·결함·서명 증거 불일치, 보호 서비스 변화, Harness 오류면 P5를 닫지 않는다.
- P5 완료 후 `P6-G0-PRODUCTION-CUTOVER-PREFLIGHT`에서 중단하며 Production 변경은 별도 승인 전 실행하지 않는다.

VERIFICATION / EVIDENCE:
- `npm.cmd run harness:status`, `npm.cmd run harness:check`, `npm.cmd run harness:verify`
- P5 JSON parse, HTTPS health/readiness, Docker 3서비스, 보호 포트·PID, scoped Git diff

OUTPUTS / FORMAT:
- `agent docs/harness/P5_G2_STAGING_UAT_SIGNOFF_EVIDENCE.json`
- `docs/phase-reports/119_P5_G2_Staging_UAT_Signoff.md`
- `MASTER_ROADMAP.json`, `docs/roadmap.md`, `docs/current-state.md`, `docs/UAT-checklist.md`
- Secret·이메일·토큰·세션 원문은 기록하지 않는다.
