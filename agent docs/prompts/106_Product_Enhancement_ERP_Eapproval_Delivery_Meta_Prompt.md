# PE-C5-G3 ERP·전자결재 delivery 메타프롬프트

ROLE:
SQCM-i C의 ERP·전자결재 outbox 전달 신뢰성 구현자다.

GOAL:
기존 outbox 이벤트를 승인된 HTTPS endpoint에 결정적으로 서명 전송할 수 있도록 만들고, 성공 수신증·재시도·dead-letter·관리자 재처리와 감사 추적을 로컬 합성 증거로 검증한다.

SCOPE:
- forward-only `031_outbox_delivery_receipts.sql`
- 공급자 독립 HTTPS HMAC publisher
- 성공 receipt와 응답 SHA-256 저장
- 안전한 실패 코드, 열 번째 dead-letter, ADMIN 재처리·감사
- 단위·loopback PostgreSQL 합성 통합시험

OUT OF SCOPE:
- 실제 ERP·전자결재 공급자 선택, endpoint·Secret 생성 또는 사용
- 실제 업무 데이터·외부 메시지 전송
- Production·staging migration·배포
- C5 전체 완료 또는 실제 공급자 UAT 완료 선언

WORKFLOW:
1. C5 G0 봉투와 기존 outbox 상태 전이를 확인한다.
2. 서명·receipt·민감 오류 미보관·관리자 재처리 실패 폐쇄 시험을 먼저 만든다.
3. 031 migration, HTTPS publisher, receipt 저장과 관리자 재처리를 최소 구현한다.
4. loopback 개발 DB에서 전용 합성 이벤트만 성공·timeout·dead-letter·재처리·cleanup 검증한다.
5. 전체 구문·단위·Harness·Git 검사를 통과하고 G3 증거와 다음 READY를 동기화한다.

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자 요청과 프로젝트 `AGENTS.md`·`CLAUDE.md`
2. C5 G0~G2 계약·증거와 제품 고도화 로드맵
3. 실제 outbox·audit DB schema와 서비스 권한 계약
4. 실제 로컬 PostgreSQL·시험·Git·Harness 결과
충돌 시 위 순서를 따르고 합성 전달을 실제 외부 공급자 수신으로 승격하지 않는다.

AUTHORITY / PERMISSIONS:
- 읽기: 활성 저장소·Git·Docker·loopback 로컬 DB
- 로컬 쓰기: G3 migration·publisher·서비스·route·시험·실행기·프롬프트·증거·로드맵과 로컬 개발 DB migration·합성 행
- 외부 쓰기: 승인된 동일 작업 branch의 exact allowlist 복구 체크포인트 push
- 금지: Production·staging DB, 실제 공급자·endpoint·Secret·업무 데이터 변경 또는 전송

CONSTRAINTS:
- endpoint는 HTTPS만 허용하고 서명 Secret은 32 byte 이상이어야 한다.
- canonical 봉투와 timestamp를 HMAC-SHA256으로 결박하고 receipt ID와 응답 SHA-256을 검증한다.
- provider 원문 오류·응답 본문·Secret·개인정보를 DB나 증거에 저장하지 않는다.
- 재처리는 ADMIN, 조직 범위, 최근 재인증과 감사로그를 모두 요구한다.
- 통합시험은 정확한 합성 event ID만 처리하고 기존 outbox 이벤트를 건드리지 않는다.

SUCCESS CRITERIA:
- application·Supabase target이 031을 포함하고 로컬 application migration 30/30이 통과한다.
- 서명 전달과 receipt 저장, 열 번째 timeout dead-letter, ADMIN 재처리 감사, 합성 cleanup 0이 PASS한다.
- 전체 구문·단위·Harness·Git exact allowlist와 원격 SHA 검사가 통과한다.
- Production·staging·실제 외부 공급자 변경이 0이다.

FAILURE CRITERIA:
- HTTP endpoint, 짧은 Secret, 서명되지 않은 봉투나 잘못된 receipt를 허용한다.
- provider 원문 오류·응답·자격증명을 저장하거나 출력한다.
- 비관리자·다른 조직이 dead-letter를 재처리하거나 감사 없이 상태를 바꾼다.
- 기존 outbox, Production·staging 또는 실제 공급자에 합성 시험을 실행한다.

VERIFICATION / EVIDENCE:
- `node --test test/unit/outbox-service.test.js test/unit/erp-eapproval-publisher.test.js test/unit/db-migration-history.test.js`
- loopback `127.0.0.1:55432`의 application migration 30/30과 `npm.cmd run test:integration:erp-delivery`
- `npm.cmd run check`, `npm.cmd run harness:status`, `npm.cmd run harness:check`
- Docker 3서비스 health, 보호 포트 관측, exact staged diff·credential pattern·remote SHA 검사

OUTPUTS / FORMAT:
- migration·publisher·outbox service·관리자 route·단위시험·합성 PostgreSQL 통합 실행기
- 사람용 체크리스트 `docs/phase-reports/164_PE_C5_G3_ERP_Eapproval_Delivery.md`
- 기계 증거 `agent docs/harness/PE_C5_G3_ERP_EAPPROVAL_DELIVERY_EVIDENCE.json`
- C5 체크리스트와 다음 READY가 반영된 제품·전체 로드맵 및 현재 상태

MEMORY UPDATE:
G3 실제 검증 수치, 로컬 전용 DB 변경, 보호 서비스 관측, Git SHA와 다음 READY만 프로젝트 문서에 남긴다.

STOP CONDITION:
G3 코드·로컬 DB 검증·문서·Git 복구 체크포인트가 증거로 닫히면 중단한다. 실제 공급자 UAT·배포는 G4에서만 수행한다.
