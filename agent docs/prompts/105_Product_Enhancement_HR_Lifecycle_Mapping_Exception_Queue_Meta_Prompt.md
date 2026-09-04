# PE-C5-G2 직원 생애주기 매핑·예외 큐 메타프롬프트

ROLE:
SQCM-i C의 HR 직원 이동·퇴사 무결성 구현자다.

GOAL:
외부 조직·부서·직원 식별자를 내부 원장에 명시적으로 연결하고, 안전하게 자동 처리할 수 없는 이동·퇴사 이벤트를 사용자·자산 변경 없이 담당자 예외 큐에 격리한다.

SCOPE:
- forward-only `030_hr_lifecycle_mapping_exceptions.sql`
- 조직·부서·직원 명시 매핑과 조직 격리
- 부서 이동·직원 정보 갱신·자산 없는 퇴사 비활성화
- 미매핑·이메일 identity 변경·퇴사 보유자산 예외 큐
- 합성 데이터 기반 단위·로컬 PostgreSQL 통합시험

OUT OF SCOPE:
- 실제 HR 공급자·직원·부서 매핑 입력
- 자산 자동 반납·배정 종료, 이메일 로그인 identity 자동 변경
- ERP delivery, Production·staging migration·배포
- 실제 계정·Secret·개인정보 생성 또는 전송

WORKFLOW:
1. G0 계약과 G1 inbox 상태 전이, 사용자·부서·배정 원장을 확인한다.
2. 미매핑과 퇴사 보유자산 실패 폐쇄 시험을 먼저 만든다.
3. 명시 매핑·예외 큐 migration과 원자적 적용 서비스를 최소 구현한다.
4. loopback 개발 DB에서 합성 이동·퇴사·cleanup을 검증한다.
5. 전체 구문·단위·Harness·Git 검사를 통과하고 G2 증거와 다음 READY를 동기화한다.

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자 요청과 프로젝트 `AGENTS.md`·`CLAUDE.md`
2. C5 G0·G1 계약·증거와 제품 고도화 로드맵
3. 실제 사용자·부서·자산 배정·감사 DB schema
4. 실제 로컬 PostgreSQL·시험·Git·Harness 결과
충돌 시 위 순서를 따르고 로컬 합성 검증을 실제 직원 또는 Production 적용으로 승격하지 않는다.

AUTHORITY / PERMISSIONS:
- 읽기: 활성 저장소·Git·Docker·loopback 로컬 DB
- 로컬 쓰기: G2 migration·서비스·시험·실행기·프롬프트·증거·로드맵과 로컬 개발 DB migration·합성 행
- 외부 쓰기: 승인된 동일 작업 branch의 exact allowlist WIP 복구 체크포인트 push
- 금지: Production·staging DB, 실제 직원·공급자·Secret·자산 배정 변경

CONSTRAINTS:
- 외부 직원번호는 기존 내부 사용자에 명시 링크되어야 하며 이메일만으로 자동 연결하지 않는다.
- 조직·부서 매핑은 provider와 organization 범위에 종속된다.
- 이메일 불일치와 유효하지 않은 부서는 자동 수정하지 않는다.
- 활성 자산이 있는 퇴사자는 계정 비활성화·자산 반납을 자동 실행하지 않는다.
- 업무 변경, inbox 완료와 감사는 같은 트랜잭션으로 처리한다.

SUCCESS CRITERIA:
- application·Supabase target이 030을 포함하고 로컬 application migration 29/29가 통과한다.
- 미매핑 이벤트는 사용자 생성 없이 REJECTED·OPEN 예외가 된다.
- 명시 매핑된 부서 이동은 APPLIED되고, 자산 보유 퇴사는 사용자·배정을 보존한 채 차단된다.
- 합성 데이터 잔존 행이 0이며 전체 구문·단위·Harness·Git 검사가 통과한다.

FAILURE CRITERIA:
- 이메일 추정으로 사용자를 만들거나 다른 조직 부서로 이동할 수 있다.
- 퇴사 이벤트가 활성 자산을 자동 반납·해제하거나 사용자를 비활성화한다.
- 실제 직원·외부 공급자·Production·staging을 변경한다.
- 관련 시험·migration·Harness·Git allowlist 중 하나라도 실패한다.

VERIFICATION / EVIDENCE:
- `node --test test/unit/hr-lifecycle-service.test.js test/unit/db-migration-history.test.js`
- loopback `127.0.0.1:55432`의 application migration 29/29와 `npm.cmd run test:integration:hr-lifecycle`
- `npm.cmd run check`, `npm.cmd run harness:status`, `npm.cmd run harness:check`
- Docker 3서비스 health, 보호 포트 관측, exact staged diff·credential pattern·remote SHA 검사

OUTPUTS / FORMAT:
- migration·생애주기 서비스·단위시험·합성 PostgreSQL 통합 실행기
- 사람용 체크리스트 `docs/phase-reports/163_PE_C5_G2_HR_Lifecycle_Mapping_Exception_Queue.md`
- 기계 증거 `agent docs/harness/PE_C5_G2_HR_LIFECYCLE_MAPPING_EXCEPTION_QUEUE_EVIDENCE.json`
- C5 체크리스트와 다음 READY가 반영된 제품·전체 로드맵 및 현재 상태

MEMORY UPDATE:
G2 실제 검증 수치, 로컬 전용 DB 변경, 보호 서비스 관측과 다음 READY만 프로젝트 문서에 남긴다.

STOP CONDITION:
G2 코드·로컬 DB 검증·문서·Git 복구 체크포인트가 증거로 닫히면 중단한다. G3 ERP delivery나 실제 공급자 연결은 수행하지 않는다.
