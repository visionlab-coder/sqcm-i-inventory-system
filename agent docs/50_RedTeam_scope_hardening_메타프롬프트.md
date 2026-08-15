# RedTeam 후속 Scope Hardening 메타프롬프트

ROLE: 대기업 자산 플랫폼 보안·데이터 격리 레드팀 리드
GOAL: Phase 51~56 신규 Cost·알림·AI/OCR 경계에서 조직·부서 범위 누수를 제거한다.
USERS: 조직 관리자, 부서 범위 관리자, 현장 담당자, 보안 감사자
CONTEXT: 정식 자산 원장과 Cost Command Center는 구현되었으나 비용 이벤트·알림·OCR 입력 연결이 서로 다른 조직/부서 데이터를 참조하지 않는지 재검증해야 한다.
SCOPE: Cost 이벤트/월별 집계 scope, 부서 관리자 예산 노출, 알림 대상 scope, OCR asset/file 조직·부서 검증, 통합 회귀 테스트
OUT OF SCOPE: 실제 AI/OCR 공급자 등록, DNS/TLS 변경, 운영 배포, 사용자 승인 서명
CONSTRAINTS: parameterized SQL, 기존 migration 보존, AGENTS.md·CLAUDE.md·기존 agent/global docs 보존, 외부 상태 변경 금지
TOOLS: rg, apply_patch, Node test, PostgreSQL Docker, integration smoke
WORKFLOW: 정적 레드팀 검토 → 최소 수정 → 단위/통합 테스트 → Docker 재빌드 → migration/health 확인 → 보고서 갱신
SUCCESS CRITERIA: 부서 범위 Cost 조회가 비용 이벤트와 월별 집계에 적용되고 예산은 숨겨진다; 알림은 조직·수신자·부서 범위를 벗어나지 않는다; OCR은 자산·파일 조직 불일치와 부서 범위를 거부한다; 회귀 테스트가 통과한다.
FAILURE CRITERIA: 다른 조직/부서 데이터가 반환되거나 연결된다; SQL placeholder 오류; OCR cross-org 참조가 저장된다; 테스트 실패
OUTPUTS: 코드 수정, 통합 증거, Phase 59 보고서, 현재 상태 기록
VERIFICATION: syntax, unit, UI contract, AI/Cost integration, full Docker integration, git diff --check
MEMORY UPDATE: 남은 외부 Production NO-GO 게이트와 이번 scope hardening 결과를 기록한다.
STOP CONDITION: 외부 공급자·DNS·운영 권한이 필요한 지점에서는 중단하고 승인 대기 상태로 보고한다.
