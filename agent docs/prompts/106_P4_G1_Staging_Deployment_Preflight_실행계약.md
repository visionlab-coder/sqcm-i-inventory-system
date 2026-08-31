# P4-G1 Staging Deployment Preflight 실행계약

ROLE:
SQCM-i staging 배포 입력의 증거 기반 사전검사자.

GOAL:
검증된 application 23개·Supabase 24개·불변 이미지 기준선에서 staging backup→migration→deploy→rollback을 실행하기 위한 실제 대상, Secret reference, PITR·backup, 이미지와 cutover 입력의 준비 상태를 판정한다.

SCOPE:
- 실제 operations manifest·배포 환경·cutover evidence 존재 여부
- 전용 Supabase project와 조직 plan 읽기 확인
- 불변 GHCR backend/frontend digest 원격 조회
- 기존 backup·restore drill의 적용 범위 확인
- Docker 3서비스와 보호 listener 보존 확인
- READY 증거와 상태 정본 동기화

OUT OF SCOPE:
- Secret 값 읽기·기록·생성
- Supabase plan·PITR·schema 변경
- DNS/TLS·Cloudflare tunnel 변경
- staging migration·이미지 pull·배포·rollback 실행
- commit·push·merge·release·Production 전환

WORKFLOW:
1. Harness와 dirty baseline을 확인한다.
2. template과 실제 운영 입력을 분리해 존재 여부를 검사한다.
3. Secret 파일은 변수명·참조 존재만 확인하고 값을 출력하지 않는다.
4. Supabase project 상태·조직 plan과 공식 backup/PITR 계약을 확인한다.
5. P2 불변 이미지 digest를 registry에서 읽기 검증한다.
6. backup·restore·cutover 증거가 실제 staging 대상에 귀속되는지 판정한다.
7. 보호 서비스 보존 후 증거·정본을 갱신한다.

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자 재개 승인과 장기 Goal+Harness
2. `MASTER_ROADMAP.json`, operations/cutover 계약, P2·P4 증거
3. 실제 파일·Docker·registry·Supabase 관측
충돌 시 실제 관측값을 우선하되 외부 변경 승인과 Secret 보호를 낮추지 않는다.

AUTHORITY / PERMISSIONS:
- 읽기: 저장소·Docker·포트·GHCR manifest·Supabase metadata·공식 문서
- 로컬 쓰기: 이 실행계약, Phase 증거, Harness·로드맵·현재상태
- 외부 쓰기: 없음

CONSTRAINTS:
- template PASS를 실제 배포 준비로 승격하지 않는다.
- 로컬 backup을 Supabase/staging backup으로 승격하지 않는다.
- Secret 원문을 출력·기록하지 않는다.
- 동일 실패 3회 시 자동 재시도를 중단한다.

SUCCESS CRITERIA:
- 실제 non-template operations manifest와 cutover evidence가 존재한다.
- staging Secret reference, backup/PITR·RPO/RTO와 복구 책임이 확인된다.
- backend/frontend 불변 이미지 digest가 registry에 존재한다.
- 배포·migration·rollback의 정확한 대상과 승인 범위가 확인된다.
- Docker 3서비스와 보호 listener가 보존된다.

FAILURE CRITERIA / STOP CONDITION:
- 실제 manifest·Secret reference·backup/PITR 또는 대상 승인이 없다.
- template·synthetic·local 증거만으로 실제 staging을 판정해야 한다.
- 기존 서비스 또는 보호 listener가 변경된다.
- 같은 원인이 3회 반복된다.

VERIFICATION / EVIDENCE:
- `npm.cmd run harness:status`, `npm.cmd run harness:check`
- `npm.cmd run operations:contracts`, `npm.cmd run deploy:check -- .env.production.example`
- GHCR digest manifest read-only inspect
- Supabase project·organization read-only inspection과 공식 backup 문서
- Docker project·보호 PID 확인, JSON parse, prompt strict 검사

OUTPUTS / FORMAT:
- `agent docs/harness/P4_G1_STAGING_DEPLOYMENT_PREFLIGHT_EVIDENCE.json`
- `docs/phase-reports/106_P4_G1_Staging_Deployment_Preflight.md`
- 상태 변경 시 Harness·로드맵·현재상태 동기화
