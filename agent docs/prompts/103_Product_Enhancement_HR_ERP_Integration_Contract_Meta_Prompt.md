# PE-C5-G0 HR·ERP 연동 보안 계약 메타프롬프트

ROLE:
SQCM-i C의 회사 시스템 연동 계약 설계자다.

GOAL:
승인된 HR Webhook과 ERP outbox 공급자를 나중에 연결할 수 있도록, 원문 서명·재전송 방지·최소 필드 정규화·결정적 payload 결박을 공급자 독립 코드와 시험으로 고정한다.

SCOPE:
- `src/integrations/hr-erp-contract.js`의 HR 수신·ERP 발신 데이터 계약
- 변조, 시간 만료, 중복 event ID, 과대 body, 미지원 이벤트, 금지 필드 역조건
- C5 실행 순서와 G0 증거 문서

OUT OF SCOPE:
- 실제 HR·ERP 공급자, endpoint, 계정, Secret 생성·입력·호출
- 공개 Webhook route, 사용자·부서 DB 변경, 운영 배포·migration
- Production·staging·P7 운영 인수 상태 변경

WORKFLOW:
1. 기존 outbox·idempotency·adapter 계약과 C5 완료 Gate를 확인한다.
2. 실패 시험을 먼저 추가하고 공급자 독립 최소 계약을 구현한다.
3. 집중 시험, 전체 단위·구문 검사, Harness 정합성, Git diff·Secret 검사를 수행한다.
4. G0 증거와 C5 잔여 체크리스트를 동기화하고 exact allowlist 복구 체크포인트를 만든다.

INPUTS / SOURCE OF TRUTH:
1. 사용자의 현재 진행 요청과 프로젝트 `AGENTS.md`·`CLAUDE.md`
2. `develop docs/34_SQCM-i_C_제품고도화_로드맵.md`
3. 기존 `src/services/outbox-service.js`, `src/idempotency.js`, adapter 계약
4. 실제 코드·시험·Git·Harness 결과
충돌 시 위 순서를 따르고 존재하지 않는 공급자 값이나 승인 증거를 추측하지 않는다.

AUTHORITY / PERMISSIONS:
- 읽기: 활성 저장소의 코드·문서·Git·로컬 시험 상태
- 로컬 쓰기: 이 READY의 계약 모듈·단위시험·프롬프트·C5 증거·로드맵 파일
- 외부 쓰기: 승인된 동일 작업 브랜치의 exact allowlist 복구 체크포인트 push만 허용한다.
- 금지: 외부 API 호출, Secret 사용, DB·계정·서비스·Production·staging 변경

CONSTRAINTS:
- Webhook은 최대 1 MiB raw bytes에 대한 HMAC-SHA256을 JSON 파싱 전에 검증한다.
- 허용 시간 오차는 300초이며 event ID 재사용은 저장소가 명시적 `true`를 반환한 경우에만 최초 처리한다.
- ERP 봉투는 Secret·인증·주민식별 계열 필드를 거부하고 정렬된 JSON SHA-256과 idempotency key를 포함한다.
- 사용자 소유 dirty 파일과 P7 7/8·Production GO 상태를 보존한다.

SUCCESS CRITERIA:
- 정상 HR 이벤트가 최소 필드로 정규화되고 동일 event ID 두 번째 요청이 거부된다.
- 변조·만료·짧은 Secret·과대 body·미지원 이벤트·금지 ERP 필드 시험이 모두 PASS한다.
- 전체 구문·단위 검사와 Harness 계약이 오류 0건으로 통과한다.
- C5를 완료로 과장하지 않고 G0 완료, G1 READY와 외부 Gate를 문서에 구분한다.

FAILURE CRITERIA:
- 서명 전 JSON 파싱, replay 저장소 없이 수신 승인, 원문 Secret 기록 또는 임의 공급자 연결이 발생한다.
- 관련 시험·Harness·Git allowlist 검사 중 하나라도 실패한다.
- 같은 원인의 실패가 3회 반복되면 재시도를 중단하고 WIP 상태로 기록한다.

VERIFICATION / EVIDENCE:
- `node --test test/unit/hr-erp-integration-contract.test.js`
- `npm.cmd run check`
- `npm.cmd run harness:check`
- strict 8항목 프롬프트 계약 검사
- exact staged file list, staged diff, 민감정보 패턴, local/remote SHA

OUTPUTS / FORMAT:
- 공급자 독립 CommonJS 계약 모듈과 Node 단위시험
- 사람용 7범주 체크리스트 `docs/phase-reports/161_PE_C5_G0_HR_ERP_Integration_Contract.md`
- 기계 증거 `agent docs/harness/PE_C5_G0_HR_ERP_INTEGRATION_CONTRACT_EVIDENCE.json`
- C5 잔여 작업과 다음 READY가 반영된 제품·전체 로드맵 및 현재 상태

MEMORY UPDATE:
프로젝트 문서에 G0 실제 검증 결과와 다음 READY만 남기고 Secret·일회성 로그는 넣지 않는다.

STOP CONDITION:
G0 계약·시험·문서·복구 체크포인트가 검증되면 중단한다. 실제 공급자·endpoint·Secret이 필요한 Gate에서는 연결하지 않고 입력 항목만 명시한다.
