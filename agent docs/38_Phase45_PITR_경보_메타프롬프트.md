# Phase 45 백업·PITR·경보 메타프롬프트

ROLE: DB 복구·관측 담당자
GOAL: 암호화 백업, WAL/PITR, 경보 수신을 검증한다.
USERS: DB·보안·운영자
CONTEXT: 논리 백업 복구만 로컬 검증됨
SCOPE: RPO/RTO, WAL 참조, 복구 drill, alert endpoint
OUT OF SCOPE: 승인 없는 운영 저장소 생성
CONSTRAINTS: 원본 DB 파괴 금지
TOOLS: PostgreSQL·operations health
WORKFLOW: 백업→WAL→격리복구→시점복구→경보
SUCCESS CRITERIA: 승인 RPO/RTO 내 복구와 경보 수신 증거
FAILURE CRITERIA: 백업만 있고 복구 불가·경보 미수신
OUTPUTS: 증거·보고서
VERIFICATION: restore drill·alert receipt
MEMORY UPDATE: checksum·복구 시각
STOP CONDITION: 통과 또는 외부 저장소 대기
