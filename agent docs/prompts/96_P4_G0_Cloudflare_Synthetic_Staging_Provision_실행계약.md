# P4-G0 Cloudflare·격리 Staging 사전환경 실행계약

기준일: 2026-08-29

## ROLE

SQCM-i 비품관리 시스템의 staging 인프라 사전구축 관리자다. 기존 SQCM-i OS와 37봇을 보존하면서 P4-G0의 실제 입력을 하나씩 확보하고, 실제 공급자 증거와 합성 사전검증을 구분한다.

## GOAL

기존 Cloudflare tunnel과 분리된 비품관리 staging tunnel·hostname·AI PC 대상 구성을 확보하고, 공개 전 격리 Docker 3서비스에서 health/readiness/smoke를 통과시켜 P4-G0의 인프라 대상 공백을 줄인다.

## USERS / EXPECTED CHANGE

서원토건 운영자는 P4-G0가 단순 문서 HOLD에 머물지 않고, 실제로 생성된 독립 tunnel과 실행 가능한 격리 staging 사전환경을 갖게 된다. 미확보 공급자는 정확히 분리되어 다음 작업 대상으로 남는다.

## CONTEXT

- 활성 저장소: `D:\seowon_projects\sqcm-i-inventory-system`
- 현재 Harness: `4 / 8`, P4-G0
- 기존 Cloudflare tunnel: `sqcm-i`, `sqcm.safe-link.co.kr → localhost:8787`
- 신규 전용 후보: `sqcm-i-inventory-staging`, `inventory-staging.safe-link.co.kr`
- 기존 local inventory Docker project와 보호 listener는 변경 금지다.

## SCOPE

- Cloudflare 공급자·바이너리·계정 경계·rollback 사전검토
- 기존 tunnel을 수정하지 않는 독립 staging tunnel 생성과 credential ACL 제한
- DNS 공개 전 tunnel config·connector 연결 시험
- 별도 Docker project의 frontend/backend/database 정확히 3서비스 격리 기동
- loopback health/readiness/smoke·로그·보호 서비스 검증
- 메타프롬프트·기계 증거·체크리스트 보고 작성

## OUT OF SCOPE

- 기존 `sqcm-i` tunnel·Windows Cloudflared 서비스·8787 서비스 변경 또는 재시작
- OIDC·객체 저장소·event publisher·PITR가 없는데 public DNS를 게시하는 행위
- 합성 local auth·local storage 증거를 실제 external provider나 P4 완료로 승격
- commit, push, merge, release, 원격 CI, Production 전환
- 기존 dirty 파일 reset·clean·broad staging

## INPUTS / SOURCE OF TRUTH

1. 현재 사용자의 P4-G0 인프라 구축 재개 승인
2. 프로젝트 `AGENTS.md`, `CLAUDE.md`, Harness와 승인 설계
3. Cloudflare 공식 문서와 서명된 실제 `cloudflared` 바이너리
4. 실제 tunnel 목록·DNS·Docker·HTTP·로그·listener 상태

충돌 시 상위 정본을 따르고, 실제 공급자 증거가 없는 항목은 합성 검증으로 낮춰 기록한다.

## WORKFLOW

Inspect → 통합 사전검토 → 새 tunnel 생성 → credential ACL → 격리 Compose → smoke/log → connector 시험 → 기존 서비스 보존 확인 → 증거 작성 → Harness 재검증

## AUTHORITY / PERMISSIONS

- 읽기: Git, Harness, Docker, 포트·프로세스, Cloudflare tunnel 목록·DNS
- 로컬 쓰기: 신규 실행계약·Compose override·ignored staging env·runtime tunnel config·증거·보고서
- 외부 쓰기: 신규 Cloudflare tunnel 한 개 생성까지만 현재 승인으로 수행
- 조건부 보류: public DNS, OAuth, 외부 provider 계정·유료 리소스, migration, Production
- 금지: 기존 tunnel·보호 서비스 변경과 Secret 원문 출력

## CONSTRAINTS

- 새 Compose project도 `frontend`, `backend`, `database` 정확히 3서비스다.
- 외부 게시 포트는 `127.0.0.1:3100 → frontend:80` 하나뿐이다.
- 기존 3000·58080·55432와 1234·11434·18765·18766·18767을 보존한다.
- 새 credential과 `.env.staging.local`은 현재 사용자·SYSTEM만 접근한다.
- local auth·local storage·seed 계정은 `synthetic-preflight`로만 사용한다.

## SUCCESS CRITERIA

- 새 tunnel이 기존 tunnel과 다른 UUID로 생성되고 기존 tunnel 연결이 보존된다.
- 새 credential ACL이 현재 사용자·SYSTEM 두 주체만 허용한다.
- 새 Compose project의 3서비스가 healthy이고 loopback smoke 5/5가 통과한다.
- 실제 오류 로그 0건, 보호 listener 변화 0건이다.
- DNS가 아직 게시되지 않아 미완성 인증 환경이 외부에 노출되지 않는다.

## FAILURE CRITERIA

- 기존 tunnel·Docker project·보호 listener가 변경된다.
- 새 서비스가 loopback 외 주소에 게시된다.
- Secret이 Git·로그·결과문서에 노출된다.
- 합성 증거가 실제 staging provider PASS로 기록된다.
- 동일 원인의 실패가 3회 반복된다.

## VERIFICATION / EVIDENCE

- `cloudflared tunnel list --output json`
- Authenticode 서명·SHA-256·ingress validate·connector 연결 시험
- Compose config 서비스/포트 검사, Docker health, `DEPLOY_BASE_URL=http://127.0.0.1:3100 npm.cmd run deploy:smoke`
- 민감정보를 출력하지 않는 서비스별 오류 로그 검사
- Harness status/check/verify와 보호 port/PID 재검증

## OUTPUTS / FORMAT

- 실행계약: 이 파일
- Compose override: `compose.staging-synthetic.yaml`
- 기계 증거: `agent docs/harness/P4_G0_STAGING_PROVISION_EVIDENCE.json`
- 사람용 보고: `docs/phase-reports/96_P4_G0_Cloudflare_Synthetic_Staging_Provision.md`
- runtime config: `D:\seowon_runtime\sqcm-i-inventory-staging\cloudflared.yml`

## MEMORY UPDATE

P4 상태가 실제로 완료되지 않았으므로 로드맵 완료 수는 바꾸지 않는다. 생성된 tunnel·격리 stack·남은 공급자 공백만 증거로 남긴다.

## STOP CONDITION

- 독립 tunnel과 격리 stack 증거를 확보하면 이번 작업을 닫는다.
- OIDC·외부 저장소·event publisher·PITR·provider Secret reference가 없으면 DNS·P4 완료 전환 없이 다음 READY를 해당 공급자 확보로 유지한다.
- 보호 서비스 변화나 보안 위험이 발견되면 즉시 중단한다.
