# P6-G1 AI PC 로컬 PostgreSQL Production 토폴로지 실행계약

기준일: 2026-09-01

ROLE:
SQCM-i 37봇과 사용자 작업을 보존하면서 동일 AI PC에 비품관리 Production을 격리 설계하는 배포 관리자다.

GOAL:
OCI 경로를 폐기하고 AI PC의 Docker PostgreSQL 16 기반 Production을 별도 Compose project·볼륨·네트워크·loopback 포트·자원 상한으로 실행 가능한 상태까지 사전검증한다.

USERS / EXPECTED CHANGE:
서원토건 운영자는 외부 클라우드 결제 없이 비품관리 시스템을 운영하되, 기존 SQCM-i 서비스와 개발·staging 환경의 중단 없이 Production 전환을 준비한다.

CONTEXT:
- 승인 결정: `OCI 폐기, AI PC PostgreSQL 운영 승인`
- AI PC: Windows 11 Pro, 24 logical CPU, RAM 약 64GB, D: 여유 약 1.81TB
- 현재 여유 RAM 약 12GB이며 여러 Docker project와 SQCM-i 보호 서비스가 실행 중이다.
- 현재 Production은 미배포이고 `productionGo=false`다.

SCOPE:
- `seowon-inventory-production` 전용 Compose project 계약
- frontend `127.0.0.1:3300`만 게시, backend/database 호스트 포트 0
- 세 서비스 CPU·메모리 상한과 project별 볼륨·네트워크 격리
- 로컬 계약 검사·단위시험·Harness·로드맵·상태 증거

OUT OF SCOPE:
- 실행 중 local·staging·37봇·보호 프로세스의 중단 또는 재생성
- Production Secret 생성·입력, 실제 migration·배포·DNS/TLS·방화벽 변경
- commit·push·PR·CI·merge·release
- OCI 계정·VM·카드·결제 절차

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자의 AI PC PostgreSQL 운영 승인
2. 프로젝트 지침·장기 Harness·현재 상태
3. 실제 Git·Docker·포트·CPU·RAM·디스크와 테스트 결과

WORKFLOW:
Inspect → 보호 서비스·자원 기준선 → 격리 Compose 계약 → 실패 방지 단위시험 → Harness 동기화 → 검증 → 다음 READY

AUTHORITY / PERMISSIONS:
- 읽기: 저장소, Git, Docker, 프로세스, 포트, 시스템 자원
- 로컬 쓰기: Compose 계약·검증기·테스트·Agent Docs·Harness·로드맵
- 금지: Secret·배포·migration·프로세스 변경·외부 Git 변경

CONSTRAINTS:
- Docker 서비스는 frontend/backend/database 정확히 3개다.
- backend/database는 호스트에 공개하지 않는다.
- frontend는 다음 TLS 터널 게이트 전까지 loopback에만 바인딩한다.
- 기존 사용자 변경과 실행 중 project를 보존한다.

SUCCESS CRITERIA:
- 전용 project 이름, loopback frontend, 비공개 backend/database와 세 서비스 자원 상한이 자동 검사된다.
- 기존 local·staging과 보호 PID/포트가 유지된다.
- Harness가 오류 0건이며 Production 배포를 완료로 오인하지 않는다.

FAILURE CRITERIA:
- 3000·3100·3200 또는 보호 포트와 충돌한다.
- backend/database 또는 frontend가 wildcard 주소로 공개된다.
- 기존 컨테이너·볼륨·프로세스가 변경된다.
- Secret·migration·Production 배포를 승인 없이 실행한다.

VERIFICATION / EVIDENCE:
- `npm.cmd run ai-pc:production-contract`
- `docker compose -f compose.yaml -f compose.production.yaml -f compose.ai-production.yaml config --no-interpolate`
- `npm.cmd run harness:check`, `npm.cmd run harness:verify`
- Docker project·health, 보호 포트/PID, Git diff

OUTPUTS / FORMAT:
- `compose.ai-production.yaml`
- `agent docs/harness/P6_G1_AI_PC_LOCAL_PRODUCTION_EVIDENCE.json`
- `docs/phase-reports/125_P6_G1_AI_PC_Local_PostgreSQL_Production_Topology.md`
- 기계 상태와 사람용 로드맵의 동일 READY

MEMORY UPDATE:
실제 상태 변화만 Harness·로드맵·현재 상태에 기록하며 Secret·개인정보는 기록하지 않는다.

STOP CONDITION:
격리 계약과 검증이 통과하면 실제 배포 없이 다음 Git·CI·불변 이미지 READY로 이동한다. 보호 서비스 변화나 검증 실패가 있으면 즉시 중단한다.
