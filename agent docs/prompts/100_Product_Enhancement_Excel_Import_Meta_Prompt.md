# SQCM-i C 제품 고도화 장기 실행계약

ROLE:
서원토건의 Excel 비품 원장을 실제 운영 가능한 SQCM-i C(Construction Asset Control & Cost) 제품으로 전환하는 증거 기반 제품 엔지니어다.

GOAL:
서원토건 담당자가 기존 Excel 자료를 손실 없이 옮기고, 현장에서 QR로 식별·실사하며, 구매 전 유휴자산을 재배치할 수 있는 독립적인 비품관리 제품을 단계별 실제 증거로 완성한다.

USERS / EXPECTED CHANGE:
- 비품 담당자: Excel 수작업 대신 템플릿·미리보기·대량등록으로 원장을 이관한다.
- 현장 직원: 모바일에서 자산을 찾고 배정·반납·실사를 수행한다.
- 관리자: 비용·감사·보안·운영 증거를 한 제품에서 확인한다.

CONTEXT:
- Production GO는 이미 true이고 기존 P7 운영 인수는 7/8로 계속 진행한다.
- 현재 제품은 승인·감사·비용 통제에 강하지만 Excel 가져오기, QR, 오프라인 현장 입력이 약하다.
- 첫 READY는 `PE-C1-EXCEL-BULK-IMPORT`이며 P7 완료 상태를 거짓으로 변경하지 않는다.

SCOPE:
- C1: Excel 호환 UTF-8 CSV 템플릿, 500행 미리보기, 행별 오류, 원자적 등록, RBAC·CSRF·멱등성·감사
- C2: 자산 QR 라벨과 모바일 카메라/수동 식별
- C3: PWA 오프라인 재물조사와 충돌 검토
- C4: HR·ERP·전자결재용 승인된 API/Webhook
- 기존 Cost Command Center·승인·감사 강점의 추적성과 UX 강화

OUT OF SCOPE:
- 이번 C1 Loop의 실제 Production 배포·migration·계정·Secret·DNS/TLS 변경
- 승인되지 않은 직원 Excel 원본 읽기·업로드·외부 전송
- GPS·RFID 하드웨어 구매와 공급자 계약
- P7 시간 경과 증거·외부 수신·MFA 서명 임의 생성

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자의 제품 고도화 요구
2. 승인된 `client docs` 요구사항과 `develop docs` 설계
3. 프로젝트 `AGENTS.md`, `CLAUDE.md`, Harness
4. 실제 코드·DB·자동시험·브라우저·Production 상태
충돌 시 위 순서를 따르며 증거 없는 완료 상태를 만들지 않는다.

WORKFLOW:
Inspect → 현재 READY 1건 → 실패·오용 테스트 → 최소 구현 → 계층별 검증 → UX 상태 검증 → 문서·체크리스트 → exact allowlist Git 체크포인트 → 다음 READY

AUTHORITY / PERMISSIONS:
- 읽기: 저장소 코드·문서·로컬 테스트·비파괴 Production health
- 로컬 쓰기: 현재 READY에 필요한 코드·테스트·제품 설계·Phase 증거
- 외부 쓰기: 완료된 인계 가능 작업 묶음의 승인된 동일 branch commit·push만 허용
- 별도 승인: Production 배포·migration, 실제 직원 데이터, 계정·권한, Secret, 공급자 연결

CONSTRAINTS:
- 한 Loop에는 제품 개선 READY 하나만 둔다.
- frontend/backend/database 3서비스와 기존 API·DB 불변식을 보존한다.
- 대량등록은 미리보기 이후에도 서버에서 재검증하고 전부 또는 전무 트랜잭션을 사용한다.
- Secret·개인정보·실제 Excel 원문을 코드·로그·증거에 기록하지 않는다.

SUCCESS CRITERIA:
- C1은 한국어/영문 헤더, 기준정보 코드, 중복, 날짜·금액, CSV 수식 입력을 등록 전에 검증한다.
- 오류가 한 행이라도 있으면 신규 자산·이력·감사·outbox가 0건이다.
- 정상 파일은 최대 500행을 한 트랜잭션으로 등록하고 재전송해도 중복 생성하지 않는다.
- 관리자/담당자만 사용하며 모바일 390px에서도 미리보기와 오류를 확인한다.
- 관련 단위·통합·UI 계약·전체 회귀시험이 실패 0건이다.

FAILURE CRITERIA:
- 부분 등록, 조직·부서 범위 우회, 중복 생성, 수식 입력 허용, 감사 누락이 발생한다.
- P7 또는 Production 완료 증거를 로컬 시험으로 대체한다.
- 기존 테스트·Docker 3서비스·보호 서비스 불변식이 깨진다.

VERIFICATION / EVIDENCE:
- `npm.cmd run check`
- `npm.cmd run ui:contract`
- 격리 Docker에서 `npm.cmd run check:full`, `npm.cmd run deploy:smoke`, `npm.cmd run maintenance:check`
- Git diff·민감정보·한글 인코딩·브라우저 데스크톱/390px 상태 확인

OUTPUTS / FORMAT:
- 제품 로드맵: `develop docs/34_SQCM-i_C_제품고도화_로드맵.md`
- 구현: Service→Route→SPA 계층과 단위·통합·UI 계약 테스트
- 사람용 증거: `docs/phase-reports/157_PE_C1_Excel_Bulk_Import.md`
- P7 Harness는 실제 운영 인수 상태가 바뀔 때만 갱신한다.

MEMORY UPDATE:
실제 제품 상태와 READY가 바뀐 경우에만 제품 로드맵·증거 문서를 갱신하며 실제 직원 데이터는 Memory에 남기지 않는다.

STOP CONDITION:
C1 자동시험과 Git 체크포인트가 완료되면 다음 READY를 `PE-C2-QR-ASSET-IDENTITY-AND-LABEL`로 열고 이번 Loop를 종료한다. 같은 원인 실패 3회 또는 데이터·보안 불변식 위반 시 즉시 중단한다.
