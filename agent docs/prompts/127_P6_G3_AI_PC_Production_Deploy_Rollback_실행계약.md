# P6-G3 AI PC Production 배포·롤백 실행계약

ROLE: SQCM-i 비품관리 AI PC Production 전환 실행 관리자다.

GOAL: 검증된 SHA 이미지와 AI PC 전용 Secret을 사용해 loopback-only Production 3서비스를 구성하고, application migration 25/25·health·readiness·인증 역조건·backup·복구·첫 배포 rollback을 실제 증거로 닫는다.

SCOPE:
- `seowon-inventory-production` Docker project와 `127.0.0.1:3300`
- PostgreSQL 16 application migration, PostgreSQL file storage
- AI PC bridge `18766`의 AI·Defender·alert·event publisher 연결
- Production 전용 로컬 Secret 파일·Docker volume, backup·restore drill
- P6-G3에 필요한 최소 코드·Compose·테스트·Harness·보고서

OUT OF SCOPE:
- `inventory.safe-link.co.kr` DNS/TLS 게시와 외부 트래픽 cutover
- main merge, release tag, 실제 운영 데이터 입력, 보호 서비스 종료
- Supabase Production, OCI, 결제·방화벽 변경

WORKFLOW: Inspect → 결함 재현 → 최소 adapter·Compose 보완 → 로컬 검증 → 정확한 allowlist commit·push → GitHub-hosted CI·동일 SHA 이미지 → Production Secret 생성 → database 기동 → migration → backend/frontend 기동 → health/readiness/smoke·로그 → backup·restore drill → 첫 배포 rollback-to-stopped → 재전진 → 상태 동기화

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자의 장기 Goal 자율 실행 승인
2. `AGENTS.md`, `CLAUDE.md`, `agent docs/harness/MASTER_ROADMAP.json`
3. P6-G2 후보·CI·image digest 증거
4. 실제 Git·Docker·포트·DB·테스트 상태

AUTHORITY / PERMISSIONS:
- 읽기: 저장소, GitHub CI/GHCR, Docker, 로컬 포트·프로세스·로그
- 로컬 쓰기: P6-G3 allowlist 코드·테스트·문서와 무시된 Production Secret·backup
- 외부 쓰기: 현재 장기 Goal 승인 범위의 후보 commit·push·GitHub-hosted CI·GHCR 이미지
- Production 변경: AI PC 내부 loopback-only Docker project·migration·Secret·rollback
- 금지: public DNS/TLS, main merge, 보호 포트/PID 중단, Secret 원문 출력·커밋

CONSTRAINTS:
- frontend/backend/database 정확히 3서비스, backend/database 호스트 포트 0
- staging·SQCM-i 37봇·보호 포트 `1234`, `11434`, `18765`를 보존한다.
- Production 앱 startup migration·seed는 false를 유지하고 migration은 별도 승인 명령으로만 적용한다.
- 첫 Production 배포는 이전 정상 이미지가 없으므로 rollback을 신규 트래픽 0·project stop·volume 보존으로 검증한다.

SUCCESS CRITERIA:
- 후보 SHA GitHub-hosted quality와 backend/frontend 불변 이미지가 동일 SHA로 성공한다.
- Production 3서비스가 healthy이고 `127.0.0.1:3300` 외 호스트 포트가 없다.
- migration 25/25, readiness 의존성 PASS, 익명 401·MFA 미등록 차단 계약 PASS다.
- backup SHA-256·격리 restore drill과 stop→재전진 rollback이 PASS한다.
- 5xx·migration·Secret 노출·보호 서비스 변화가 0이다.

FAILURE CRITERIA:
- Secret 또는 가변 tag 사용, CI/manifest 불일치, migration·restore 실패
- backend/database 공개, 세 서비스 이외 생성, readiness·인증 역조건·로그 실패
- staging·보호 PID 변화 또는 동일 원인 실패 3회

VERIFICATION / EVIDENCE:
- `npm.cmd run check`, `npm.cmd run ai-pc:production-contract`, `npm.cmd run harness:verify`
- Git SHA·CI run·GHCR digest, `docker compose config/ps`, HTTP health/readiness/smoke
- `db:migrate`, `db:verify`, `db:backup`, `db:restore-drill`, Docker 로그와 포트/PID

OUTPUTS / FORMAT:
- 기계 증거 `agent docs/harness/P6_G3_AI_PC_PRODUCTION_DEPLOY_ROLLBACK_EVIDENCE.json`
- Phase 보고서 `docs/phase-reports/127_P6_G3_AI_PC_Production_Deploy_Rollback.md`
- 현재 상태·로드맵·Harness READY를 같은 사실로 동기화한다.
- Secret·토큰·비밀번호·세션 원문은 모든 출력에서 제외한다.

STOP CONDITION: G3 증거가 모두 PASS하면 P6-G4를 다음 READY로 지정한다. public DNS/TLS cutover 전에는 `productionGo=false`를 유지한다. 보호 서비스 변화·Secret 노출·동일 실패 3회면 즉시 중단한다.
