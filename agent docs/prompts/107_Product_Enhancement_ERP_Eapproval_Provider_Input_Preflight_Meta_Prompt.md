# PE-C5-G4 ERP·전자결재 공급자 입력 사전검토 메타프롬프트

ROLE:
SQCM-i C의 실제 ERP·전자결재 연결 전 입력·승인 Gate 검증자다.

GOAL:
제품명, HTTPS endpoint, 필드 매핑, Secret reference, 시험 책임자와 승인큐를 기계적으로 검증하고, 하나라도 근거가 없으면 외부 호출·배포·결재/자금 변경을 열지 않는다.

SCOPE:
- 기존 승인 문서·설정의 5항목 읽기 확인
- Secret 원문을 허용하지 않는 JSON 입력계약
- 공급자 입력 fail-closed 검증기·CLI·합성 단위시험
- G4 입력 체크리스트·기계 증거·로드맵 동기화

OUT OF SCOPE:
- 실제 공급자 선정 또는 API 문서의 임의 추정
- `.env`·Secret 파일의 값 출력·복사·사용
- 외부 HTTPS 호출, staging·Production 배포
- 실제 결재·자금·직원·자산 데이터 생성 또는 변경
- C5 G4·C5 Epic 완료 선언

WORKFLOW:
1. 프로젝트 지침, C5 G0~G3 증거, Harness와 dirty 기준선을 확인한다.
2. 승인 문서·manifest·환경변수 이름에서 5항목의 증거를 값 노출 없이 조사한다.
3. 누락 입력과 조건부 승인 상태가 외부 실행을 차단하는 실패 시험을 먼저 만든다.
4. 입력계약·검증기·CLI를 최소 구현하고 완전 합성 계약, Secret 원문, endpoint·mapping 역조건을 검증한다.
5. 전체 구문·단위·Harness·Git allowlist를 검증하고 G4 입력 Gate 증거와 다음 READY를 동기화한다.

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자의 2026-09-07 조건부 승인 지시
2. 프로젝트 `AGENTS.md`·`CLAUDE.md`, 승인된 요구사항·설계
3. C5 G0~G3 프롬프트·보고서·기계 증거와 제품 고도화 로드맵
4. 실제 config·환경변수 이름·source usage·시험·Git·Harness 결과
일반 event publisher 설정을 실제 ERP·전자결재 공급자 승인으로 승격하지 않는다.

AUTHORITY / PERMISSIONS:
- 읽기: 활성 저장소·승인 문서·설정 구조·Git·Harness
- 로컬 쓰기: G4 입력계약·검증기·시험·프롬프트·증거·로드맵
- 외부 쓰기: 승인된 동일 작업 branch의 exact allowlist WIP 복구 체크포인트 push
- 금지: Secret 값 읽기·출력, 외부 호출, 배포, 실제 업무 데이터 변경

CONSTRAINTS:
- 제품명·공급자·API version과 근거를 함께 요구한다.
- endpoint는 staging HTTPS POST이며 credential·query·fragment·example hostname을 금지한다.
- field mapping은 outbound 7필드와 receipt 2필드, 방향·분류·근거를 포함한다.
- Secret은 `secret://` 또는 `/run/secrets/` reference만 허용하고 원문형 key를 거부한다.
- 시험 책임자는 실행·결과 서명·rollback 책임과 근거를 가져야 한다.
- 승인큐가 `APPROVED_FOR_STAGING_UAT`가 아니면 5항목이 있어도 외부 실행을 열지 않는다.

SUCCESS CRITERIA:
- 현재 불완전 입력은 정확히 `HOLD_EXTERNAL_INPUT`과 6개 실패 사유를 반환한다.
- 완전 합성 입력만 `READY_FOR_STAGING_CONTRACT_UAT`가 된다.
- Secret 원문형 key와 부적합 endpoint·mapping이 fail-closed 된다.
- 집중 16/16, 전체 단위·구문·Harness·Git 검사가 PASS한다.
- 외부 호출·배포·결재/자금 변경이 0이다.

FAILURE CRITERIA:
- 일반 event publisher 값을 C5 승인 입력으로 재사용한다.
- 미확정·example·근거 없는 5항목 중 하나를 PASS 처리한다.
- Secret 원문 또는 credential이 포함된 endpoint를 허용한다.
- 조건부 승인만으로 외부 UAT·배포·실제 데이터를 변경한다.
- 사용자 소유 dirty 파일을 수정하거나 체크포인트에 포함한다.

VERIFICATION / EVIDENCE:
- `node --test test/unit/erp-eapproval-provider-input-preflight.test.js test/unit/hr-erp-integration-contract.test.js test/unit/erp-eapproval-publisher.test.js test/unit/outbox-service.test.js`
- `npm.cmd run c5:provider-input-preflight`의 예상 `HOLD_EXTERNAL_INPUT`·exit 2
- `npm.cmd run check`, `npm.cmd run harness:status`, `npm.cmd run harness:check`
- `git diff --check`, exact staged allowlist, credential pattern, local·remote SHA 일치

OUTPUTS / FORMAT:
- 입력 검증 모듈·CLI·단위시험과 `PE_C5_G4_PROVIDER_INPUT_CONTRACT.json`
- 사람용 체크리스트 `docs/phase-reports/165_PE_C5_G4_Provider_Input_Preflight.md`
- 기계 증거 `agent docs/harness/PE_C5_G4_PROVIDER_INPUT_PREFLIGHT_EVIDENCE.json`
- G4 입력 상태와 다음 READY가 반영된 제품·전체 로드맵 및 현재 상태

MEMORY UPDATE:
5항목과 승인 상태, 검증 수치, 외부 변경 0, Git SHA와 다음 READY만 프로젝트 문서에 기록한다.

STOP CONDITION:
입력 Gate·합성시험·체크리스트가 증거로 닫히면 중단한다. 실제 공급자 UAT·배포는 5항목과 승인큐가 모두 PASS한 후 별도 Loop에서만 수행한다.
