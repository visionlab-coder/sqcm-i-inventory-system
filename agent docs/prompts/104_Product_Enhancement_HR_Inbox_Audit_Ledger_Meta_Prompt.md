# PE-C5-G1 HR inbox·감사 원장 메타프롬프트

ROLE:
SQCM-i C의 HR 연동 데이터 무결성 구현자다.

GOAL:
G0에서 서명 검증된 최소 HR 이벤트를 조직별 중복 없이 수신하고, 처리·재시도·거부·dead-letter 상태와 감사 이력을 PostgreSQL 트랜잭션으로 보존한다.

SCOPE:
- forward-only `029_hr_integration_inbox.sql`과 application·Supabase migration manifest
- HR inbox 기록, 동일 event ID 중복·payload 충돌, SKIP LOCKED claim, stale lock 회수
- APPLIED·REJECTED·RETRY_PENDING·DEAD_LETTER 상태와 감사 로그
- 합성 이벤트 기반 단위·로컬 PostgreSQL 통합시험

OUT OF SCOPE:
- 공개 Webhook endpoint와 실제 HR 공급자 호출
- 직원·부서·자산 업무 데이터 적용
- ERP delivery, Production·staging migration·배포
- 실제 계정·Secret·개인정보 생성 또는 전송

WORKFLOW:
1. DB·감사·migration 정본과 G0 최소 이벤트 계약을 확인한다.
2. 실패 시험을 먼저 추가하고 UNIQUE·CHECK·index·transaction 계약을 최소 구현한다.
3. 단위시험 뒤 loopback 로컬 PostgreSQL에만 migration을 적용하고 합성 이벤트의 중복·충돌·retry·apply·reject·cleanup을 검증한다.
4. 전체 구문·단위·Harness·Git 검사를 통과한 뒤 G1 증거와 다음 READY를 동기화한다.

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자 요청과 프로젝트 `AGENTS.md`·`CLAUDE.md`
2. C5 G0 계약 모듈·증거와 `develop docs/34_SQCM-i_C_제품고도화_로드맵.md`
3. 기존 migration manifest, `audit_logs`, outbox·transaction 구현
4. 실제 로컬 PostgreSQL·시험·Git·Harness 결과
충돌 시 위 순서를 따르고 운영 또는 Supabase 적용을 로컬 증거로 승격하지 않는다.

AUTHORITY / PERMISSIONS:
- 읽기: 활성 저장소·Git·Docker·loopback 로컬 DB 상태
- 로컬 쓰기: G1 migration·서비스·시험·실행기·프롬프트·증거·로드맵 파일과 로컬 개발 DB의 forward-only migration·합성 행
- 외부 쓰기: 승인된 동일 작업 branch의 exact allowlist 복구 체크포인트 push만 허용한다.
- 금지: Production·staging DB, 외부 API·메시지·Secret·실제 직원 데이터 변경

CONSTRAINTS:
- 원문 payload는 저장하지 않고 G0가 허용한 최소 정규화 payload만 JSONB로 저장한다.
- `(organization_id, provider_id, external_event_id)` UNIQUE와 payload SHA-256 충돌 검사를 함께 적용한다.
- worker는 `FOR UPDATE SKIP LOCKED`로 한 건만 claim하고 5분 초과 stale PROCESSING을 회수한다.
- 열 번째 실패는 추가 재시도 없이 DEAD_LETTER로 격리하며 오류 메시지 대신 허용된 오류 코드만 저장한다.
- 모든 상태 변경과 감사 기록은 같은 트랜잭션이며 합성 시험 행을 정확히 정리한다.

SUCCESS CRITERIA:
- application·Supabase target이 `029`를 누락 없이 열거하고 로컬 application migration이 28/28이다.
- 동일 payload 재전송은 duplicate, 같은 event ID의 다른 payload는 감사 후 409 conflict다.
- 합성 PostgreSQL 흐름에서 APPLIED·REJECTED와 6개 감사 action을 확인하고 잔존 행이 0이다.
- 집중·전체 단위, 구문, strict 프롬프트, Harness 검사가 오류 0건으로 통과한다.

FAILURE CRITERIA:
- 검증 전 원문 저장, 조직 없는 중복키, lock 소유자 없는 완료, 무제한 retry 또는 오류 원문 저장이 가능하다.
- 로컬 외 DB에 migration을 적용하거나 실제 직원·공급자 데이터를 생성한다.
- 관련 시험·migration·Harness·Git allowlist 검사 중 하나라도 실패한다.

VERIFICATION / EVIDENCE:
- `node --test test/unit/hr-integration-inbox-service.test.js test/unit/db-migration-history.test.js`
- loopback `127.0.0.1:55432`의 `db:migrate` 28/28과 `npm.cmd run test:integration:hr-inbox`
- `npm.cmd run check`, `npm.cmd run harness:check`
- strict 8항목 프롬프트 계약, exact staged list·diff·credential 패턴·remote SHA 검사

OUTPUTS / FORMAT:
- migration·서비스·단위시험·합성 PostgreSQL 통합 실행기
- 사람용 체크리스트 `docs/phase-reports/162_PE_C5_G1_HR_Inbox_Audit_Ledger.md`
- 기계 증거 `agent docs/harness/PE_C5_G1_HR_INBOX_AUDIT_LEDGER_EVIDENCE.json`
- C5 체크리스트와 다음 READY가 반영된 제품·전체 로드맵 및 현재 상태

MEMORY UPDATE:
G1 실제 검증 수치, 로컬 전용 migration 사실과 다음 READY만 프로젝트 문서에 남긴다.

STOP CONDITION:
G1 코드·로컬 DB 검증·문서·Git 복구 체크포인트가 증거로 닫히면 중단한다. 실제 직원 적용·공급자 연결은 수행하지 않는다.
