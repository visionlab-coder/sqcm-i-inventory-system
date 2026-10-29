# 자산 기본정보 수정 실행 계약

ROLE: 기존 자산 업무의 세로 기능 구현·검증 담당. execution_mode=single, 실제 모델·추론 설정 inherited/unknown, Laya=RULE.
GOAL: 허용된 관리자가 자산 상세에서 기본정보를 수정하고 변경 전후·사유·작업자·시각을 조회하며 USER/타 조직·부서/동시 덮어쓰기는 차단한다.
SCOPE: name/serialNo/categoryId/modelId/locationId/acquiredAt, PATCH /api/enterprise/assets/:id, 기존 audit_logs 기반 이력, PostgreSQL xmin 낙관적 버전, 상세 편집·취소·충돌 화면과 테스트·운영 반영.
OUT OF SCOPE: 자산번호·조직·부서·취득가·상태 직접 변경, 직원 계정 변경, 실제 자산 수정, schema migration·기존 서비스/터널 변경.
INPUTS / SOURCE OF TRUTH: 현재 사용자 승인, AGENTS/CLAUDE, 기존 scope-service·enterprise-service·audit·프런트, test 및 실제 운영 상태. 기준 HEAD bd8921d2a4116befb4ef29b21e3b8de2d9fb91df, 기존 dirty5개 보존.
AUTHORITY: 관련 코드·테스트·스킬·증거와 exact allowlist checkpoint/push, 같은 Inventory backend/frontend 배포. 기존 전용 UAT 계정으로 브라우저 시험. 필요한 시험 전용 분류·위치는 고유 표식으로 새로 추가하고 종료 후 비활성화하며 기존 기준정보·직원·실제 자산은 수정하지 않는다.
WORKFLOW: 실패/권한 시험 → 최소 구현 → 단위·실제 PG 통합·CI → 불변 이미지·기존 이미지 복귀 경로 → 배포 → 분리된 브라우저 세션으로 등록/수정/새로고침/이력/조회 → 시험 자산 취소·전용 기준정보 비활성 → 기존 데이터 fingerprint 대조·문서 동기화.
SUCCESS CRITERIA: 요청 필드 수정·이력·권한·동시성 테스트 통과, green CI 동일 SHA, 실제 브라우저 정상 흐름, 기존 직원/실데이터 불변·서비스3 healthy·보호 터널 보존.
FAILURE CRITERIA / STOP CONDITION: 승인 외 데이터 수정, Secret 노출, 미확인 계정/정책, 같은 원인3회 실패. 준비·API 시험을 브라우저 성공으로 승격하지 않는다.
CONSTRAINTS: 새 테이블 없이 기존 감사 재사용. USER403·비로그인401, scoped ref 활성/조직/모델분류 일치, 폐기/취소 자산 수정 거부, 충돌409·무변경 감사0·실패 rollback.
VERIFICATION / EVIDENCE: 구문·unit·integration·UI 계약·CI, API/DB 감사 및 버전, PC1440/mobile390 브라우저 화면·비식별 캡처, 계정/기존 업무 fingerprint·health·smoke·rollback 경로.
OUTPUTS / FORMAT: 코드·시험·조작 스킬/연결·기계 JSON·보고서176·현재상태, 정확한 SHA/종료코드/PASS/FAIL/NOT_RUN. Secret·직원명부 제외. 실제 rollback은 실행했을 때만 PASS.
