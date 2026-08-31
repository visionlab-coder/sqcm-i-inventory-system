# P3 G5 Pilot UAT 참여자·책임자 지정 실행계약

ROLE:
SQCM-i 비품관리 시스템의 파일럿 UAT 조정자다.

GOAL:
사용자의 명시적 지정을 근거로 ADMIN·MANAGER·USER 시험 참여자와 업무·보안·운영 책임자를 확정해 G5 실제 UAT를 실행 가능한 상태로 전환한다.

SCOPE:
- `PROJECT_OWNER_CURRENT_USER`를 ADMIN·MANAGER·USER 시험 참여자로 지정한다.
- 같은 사용자를 업무·보안·운영 책임자로 지정한다.
- 기존 19개 UAT 항목과 담당자 지정을 기계 상태·사람용 보고서·로드맵에 연결한다.
- 담당자는 추후 사용자의 명시적 요청으로 변경할 수 있게 한다.

OUT OF SCOPE:
- 실제 UAT를 수행하지 않고 PASS 또는 서명을 생성하는 일
- Production 배포·migration·실데이터 생성
- Secret·비밀번호·세션 원문 기록
- commit·push·merge·release

WORKFLOW:
1. 기존 UAT 정본과 현재 G5 HOLD 사유를 확인한다.
2. 사용자 원문 승인을 참여자·책임자 지정 증거로 기록한다.
3. 19개 UAT 항목을 `PENDING_USER_EXECUTION`으로 생성한다.
4. Harness·현재 상태·로드맵을 실제 UAT 실행 READY로 갱신한다.
5. 계약·JSON·Harness·Git diff를 검증하고 중단한다.

INPUTS / SOURCE OF TRUTH:
1. 2026-08-25 현재 사용자의 “담당자는 나로 하시오, 추후 변경도 가능” 승인
2. `docs/UAT-checklist.md`
3. `docs/pilot-uat-execution.md`
4. `agent docs/harness/MASTER_ROADMAP.json`
5. 실제 코드·테스트·실행 상태
충돌 시 위 순서를 따르고 실제 UAT 미실행 상태를 PASS로 추정하지 않는다.

AUTHORITY / PERMISSIONS:
- 읽기: 저장소 문서·코드·테스트·로컬 실행 상태
- 로컬 쓰기: G5 계약·Harness·단계 보고서·현재 상태·로드맵
- 외부 상태 변경: 금지. Production·외부 공급자·Git 원격 작업은 별도 승인 필요

SUCCESS CRITERIA:
- ADMIN·MANAGER·USER 참여자가 `PROJECT_OWNER_CURRENT_USER`로 지정된다.
- 업무·보안·운영 책임자가 같은 사용자로 지정된다.
- 19개 항목 모두 담당자가 연결되고 상태는 실제 실행 전까지 `PENDING_USER_EXECUTION`이다.
- G5 HOLD 사유가 참여자 미지정에서 실제 UAT 실행 READY로 변경된다.

FAILURE CRITERIA / STOP CONDITION:
- 사용자 지정을 확인할 수 없거나 항목 수가 19개가 아니다.
- 실제 실행·서명 없이 PASS가 기록된다.
- 보호 서비스·Docker·Secret·Production 상태를 변경하게 되면 즉시 중단한다.

VERIFICATION / EVIDENCE:
- 프롬프트 계약 strict 8/8
- G5 JSON parse와 19개 항목·6개 역할 연결 검사
- `npm.cmd run harness:check`
- `git diff --check`

OUTPUTS / FORMAT:
- `agent docs/harness/P3_G5_UAT_EVIDENCE.json`
- `docs/phase-reports/91_P3_G5_Pilot_UAT_Actor_Assignment.md`
- 갱신된 `MASTER_ROADMAP.json`, `P3_RUNTIME_EVIDENCE.json`, `docs/current-state.md`, `docs/roadmap.md`
