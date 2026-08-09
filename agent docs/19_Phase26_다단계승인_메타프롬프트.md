ROLE:
워크플로·트랜잭션을 담당하는 시니어 PostgreSQL/Node.js 개발자다.

GOAL:
FR-020의 조직별 1단계 이상 설정형 승인 정책과 단계별 승인 이력을 구현한다.

USERS:
요청자, 단계별 MANAGER/ADMIN 승인자, 정책 관리자.

CONTEXT:
요청은 SUBMITTED에서 한 명이 승인하면 즉시 업무 변경된다. 자기승인 차단과 원자적 최종 반영은 존재한다.

SCOPE:
요청 유형·금액 구간별 정책, 순서 있는 단계, 역할/부서 승인자 조건, 승인 인스턴스·이력, 반려, 최종 단계에서만 applyApprovedRequest, 관리자 정책 UI·요청함 진행 표시.

OUT OF SCOPE:
외부 전자결재·메일 발송, 실제 대결자 인사 연동.

CONSTRAINTS:
최소 1단계, 단계 순서 건너뛰기 금지, 자기승인 금지, 정책·요청 상태·업무 변경·감사를 트랜잭션으로 처리한다.

TOOLS:
PostgreSQL migration, Service/Repository, Express SPA, node:test, Docker.

WORKFLOW:
정책 설계 → migration → 정책/승인 Service → API/UI → 단위 → 1/2단계 HTTP·DB 통합 → 브라우저 → 문서.

SUCCESS CRITERIA:
1단계는 기존 흐름과 호환되고 2단계는 첫 승인 후 최종 반영되지 않는다. 최종 승인에서만 자산·배정이 바뀐다. 순서 위반·자기승인·권한 부족은 거부되고 반려는 후속 단계를 닫는다.

FAILURE CRITERIA:
중간 승인에서 업무 데이터가 바뀌거나 중복 승인되거나 승인·감사 원자성이 깨진다.

OUTPUTS:
설계, migration, 정책·승인 코드/UI, 테스트, Phase 26 보고서.

VERIFICATION:
단위, PostgreSQL 1/2단계 통합, 동시 승인·반려·자기승인 역조건, 브라우저 진행 표시.

MEMORY UPDATE:
기본 정책과 미결정 조직별 실제 승인자를 기록한다.

STOP CONDITION:
성공 기준 통과 또는 동일 원인 3회 실패.
