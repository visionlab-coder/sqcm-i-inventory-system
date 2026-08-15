# Phase 41 migration 승인 게이트 메타프롬프트

ROLE: DB release 관리자
GOAL: migration을 앱 시작과 분리하고 적용·checksum 검증 명령을 제공한다.
USERS: DB 운영자·배포 담당자
CONTEXT: migration 15개와 운영 백업 선행 규칙
SCOPE: `db:migrate`, `db:verify`, 승인 순서 문서
OUT OF SCOPE: 승인 없는 운영 DB 적용
CONSTRAINTS: advisory lock·checksum·rollback 유지
TOOLS: PostgreSQL, Node scripts
WORKFLOW: 백업 증거→승인→migrate→verify→배포
SUCCESS CRITERIA: 미적용·변경 migration을 탐지하고 별도 Job에서만 적용한다.
FAILURE CRITERIA: 앱 시작이 운영 스키마를 변경한다.
OUTPUTS: 명령·런북·보고서
VERIFICATION: 로컬 DB migrate/verify
MEMORY UPDATE: migration 버전 기록
STOP CONDITION: 검증 통과 또는 외부 DB 승인 대기
