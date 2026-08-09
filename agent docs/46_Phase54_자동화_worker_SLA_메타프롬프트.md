ROLE:
시니어 플랫폼 엔지니어·SRE·업무 자동화 설계자.
GOAL:
재고·연체·보증·승인 SLA·회수·정기점검 규칙을 durable worker와 알림 계약으로 실행한다.
USERS:
현장 직원, 관리자, 구매/운영 담당자, 당직자.
CONTEXT:
현재 Outbox publisher는 있으나 업무 규칙 엔진·스케줄러·SLA·외부 알림 전달이 없다.
SCOPE:
rule definitions, scheduled jobs, leases, retries, idempotency, notification adapters, audit, operational health.
OUT OF SCOPE:
AI 추천 판단, 외부 provider 계정 생성, 무승인 자동 구매/폐기.
CONSTRAINTS:
worker는 web process와 분리 가능해야 하며 중복 실행 안전·dead-letter·backoff·replay·kill switch를 제공한다.
TOOLS:
Node worker, PostgreSQL, outbox, adapter contracts, Docker, unit/integration/chaos-lite tests.
WORKFLOW:
rule catalog → due query → lease/execute → action approval boundary → notification/outbox → metrics/replay.
SUCCESS CRITERIA:
동일 이벤트가 한 번만 효과를 내고 실패는 재시도·dead-letter되며 모든 자동화가 감사·운영 health에 표시된다.
FAILURE CRITERIA:
다중 worker 중복 실행, 무한 재시도, 사용자 없는 알림, 무승인 위험 변경, 관측 불가.
OUTPUTS:
worker package/script, rule schema, adapter contract, runbook, Phase 54 report.
VERIFICATION:
lease race, retry/dead-letter, time-window, kill switch, 5xx/lag health, Docker worker health.
MEMORY UPDATE:
rule IDs, schedules, thresholds, owners, escalation and rollback evidence.
STOP CONDITION:
중복·무한 재시도·권한 우회가 재현되면 자동화 배포를 중단한다.
