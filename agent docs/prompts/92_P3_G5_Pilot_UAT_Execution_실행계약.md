# P3 G5 Pilot UAT 실행계약

ROLE:
SQCM-i 비품관리 시스템의 로컬 파일럿 UAT 실행자다.

GOAL:
사용자가 승인한 `PROJECT_OWNER_CURRENT_USER` 담당 체계에서 ADMIN·MANAGER·USER의 19개 UAT 항목을 실제 자동·브라우저·운영 증거에 연결하고, PASS·FAIL·NOT_RUN을 사실대로 판정한다.

SCOPE:
- 로컬 파일럿 `http://127.0.0.1:3000/`과 현재 Docker 3서비스
- 역할별 로그인·세션·MFA·RBAC·자산·승인·반납·구매·감사·AI 흐름
- 데스크톱·모바일 브라우저 확인
- health·readiness·smoke·migration·로그·복구·rollback 기존 증거의 현재 재검증
- `P3_G5_UAT_EVIDENCE.json`, 단계 보고서, Harness와 로드맵 갱신

OUT OF SCOPE:
- 실제 staging·Production 배포 또는 migration
- 외부 OIDC·저장소·악성코드 검사기·경보 채널 생성
- 실제 비품·개인정보 사용
- 확인하지 않은 사용자 판단이나 승인 서명 대행
- commit·push·merge·release

WORKFLOW:
1. G5 담당자·19개 체크리스트와 로컬 실행 기준선을 확인한다.
2. 프롬프트 계약을 strict 검사한다.
3. 역할·MFA·업무·AI 통합 테스트와 운영 검사를 실행한다.
4. 로컬 브라우저에서 역할별 로그인·화면·로그아웃과 모바일 핵심 화면을 확인한다.
5. 각 UAT 항목을 증거가 있는 PASS, 관찰된 FAIL, 외부 입력이 필요한 NOT_RUN으로 갱신한다.
6. Critical·High 결함과 남은 승인 상태에 따라 G5를 판정하고 Harness·로드맵을 동기화한다.

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자의 G5 실행 승인과 담당자 지정
2. `agent docs/harness/P3_G5_UAT_EVIDENCE.json`
3. `docs/UAT-checklist.md`, `docs/pilot-uat-execution.md`
4. 프로젝트 코드·통합 테스트·운영 스크립트
5. 현재 브라우저·Docker·API·DB·로그의 관찰 결과
충돌 시 실제 실행 증거를 우선하고 과거 PASS는 현재 실행 없이 재사용하지 않는다.

AUTHORITY / PERMISSIONS:
- 읽기: 저장소·로컬 브라우저·Docker·API·DB·로그·보호 포트
- 로컬 쓰기: 테스트가 생성하는 비식별 로컬 파일럿 데이터와 G5 문서·Harness 증거
- 자격증명: Git 무시 `.env`의 로컬 시드 자격증명을 출력하지 않고 localhost 로그인에만 사용
- 외부 상태 변경: 금지. Production·외부 공급자·Git 원격 작업은 별도 승인 필요

CONSTRAINTS:
- frontend·backend·database 정확히 3서비스를 유지한다.
- 1234/PID 6632, 11434/PID 8588, 18765/PID 22716을 포함한 보호 서비스를 변경하지 않는다.
- Secret·비밀번호·세션·OCR 원문을 로그·보고서·Memory에 기록하지 않는다.
- 자동 테스트는 실제 사용자의 주관적 화면 승인이나 책임자 서명을 대신하지 않는다.

SUCCESS CRITERIA:
- 19개 항목 각각에 현재 실행 증거와 PASS·FAIL·NOT_RUN 중 하나가 기록된다.
- 역할별 API·브라우저 경계가 통과하고 Critical·High 결함이 0이다.
- G5 완료를 주장하려면 필수 19개가 모두 PASS이고 업무·보안·운영 승인이 실제로 기록돼야 한다.

FAILURE CRITERIA:
- 인증 우회·역할/부서 데이터 노출·원장 손상·핵심 흐름 실패는 Critical 또는 High로 판정한다.
- 외부 공급자·실제 사용자 판단·서명 증거가 없으면 해당 항목은 NOT_RUN이며 G5 완료로 전환하지 않는다.
- 같은 원인의 실패가 3회 반복되거나 보호 서비스가 변경되면 즉시 중단한다.

VERIFICATION / EVIDENCE:
- 프롬프트 strict 8/8
- `npm.cmd run check:full`, `npm.cmd run ui:contract`, 역할·AI 통합 결과
- 브라우저 DOM·역할별 화면·모바일 viewport·console 오류
- `npm.cmd run deploy:smoke`, `npm.cmd run maintenance:check`, 관련 복구 검사
- Docker 3서비스, 보호 listener/PID, Repository hygiene, Harness, JSON, Git diff

OUTPUTS / FORMAT:
- 실행 증거가 갱신된 `agent docs/harness/P3_G5_UAT_EVIDENCE.json`
- `docs/phase-reports/92_P3_G5_Pilot_UAT_Execution.md`
- 갱신된 `MASTER_ROADMAP.json`, `P3_RUNTIME_EVIDENCE.json`, `docs/current-state.md`, `docs/roadmap.md`
- 최종 보고는 PASS·FAIL·NOT_RUN 수, 결함, G5 상태와 다음 READY를 구분한다.

STOP CONDITION:
19개 판정과 회귀 검증을 한 번 보고한 뒤 중단한다. 미확인 항목을 자동 재시도하거나 PASS로 추정하지 않는다.
