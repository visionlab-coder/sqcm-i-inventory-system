# P4-G0 Staging Target·Provider 재개 실행계약

기준일: 2026-08-29

## ROLE

SQCM-i 비품관리 시스템의 증거 기반 staging 사전검증 관리자다. 장기 Goal+Harness에서 한 번에 현재 READY 한 건만 수행하고, 공급자·대상·권한을 추정하지 않는다.

## GOAL

`P4-G0-STAGING-TARGET-AND-PROVIDER-INPUT`에 필요한 실제 staging 대상과 공급자 입력이 존재하는지 재검증한다. 입력이 모두 확인되면 P4 staging preflight로 이동할 수 있는 증거를 만들고, 하나라도 없으면 외부 변경 없이 정확한 HOLD 증거와 체크리스트를 남긴다.

## USERS / EXPECTED CHANGE

서원토건 운영자는 반복해서 `다음 진행`을 입력하지 않아도 안전한 로컬 검증은 계속 수행된다. 실제 계정·Secret·외부 인프라가 필요한 시점에는 누락 대상과 이유가 한 번에 제시된다.

## CONTEXT

- 활성 저장소: `D:\seowon_projects\sqcm-i-inventory-system`
- 활성 브랜치/HEAD: `codex/fix-sidebar-accessibility` / `dfc37e3bfa60ea69a54900678897ee6b3a0eb078`
- Harness: `4 / 8`, 현재 P4, READY `P4-G0-STAGING-TARGET-AND-PROVIDER-INPUT`
- P3는 19/19 PASS이며 기존 dirty worktree와 보호 포트·Docker 3서비스를 보존한다.
- 사용자는 P4-G0 이후의 로컬 자율 진행을 승인했다. 이 승인은 존재하지 않는 외부 계정·Secret·운영 대상을 발명하거나 Production 변경을 수행하는 권한이 아니다.

## SCOPE

- Harness·Git·Docker·예약 작업·보호 listener의 현재 상태와 2026-08-25 이후 변화 확인
- staging hostname, 서버·계정, PostgreSQL/PITR, 객체 저장소, OIDC, malware scanner, event publisher, alert, AI provider와 Secret reference 존재 여부 확인
- 기존 템플릿·Compose·운영 계약의 비파괴 로컬 검증
- P4-G0 체크리스트, 기계 판정 증거와 사람용 결과 보고 작성

## OUT OF SCOPE

- 공급자·서버·계정·credential·Secret·인증서의 임의 생성 또는 추정
- OAuth 동의, DNS/TLS 변경, 외부 배포·migration·데이터 전송
- commit, push, merge, release, 원격 CI 유발
- Production 전환 또는 P4-G0 미통과 상태에서 P4 이후 Gate 완료 처리
- 기존 dirty 파일 reset·clean·덮어쓰기, 보호 프로세스 종료, Docker 서비스 구성 변경

## INPUTS / SOURCE OF TRUTH

1. 현재 사용자의 명시적 요구와 승인 범위
2. `client docs` 승인 요구사항과 `develop docs` 설계
3. 프로젝트 `AGENTS.md`, `CLAUDE.md`, `docs/current-state.md`, `docs/roadmap.md`
4. `agent docs/harness/MASTER_ROADMAP.json`
5. 실제 Git·파일·Docker·HTTP·DNS·프로세스·예약 작업 상태

충돌 시 위 순서를 따르되, 실제 상태와 문서의 차이는 별도 미결정 또는 실패로 기록한다.

## WORKFLOW

Inspect → Harness 계약 검사 → 현재 READY 1건 → 입력 탐색 → 통합 사전검토 → 로컬 계약 검증 → 증거 작성 → Harness 재검증 → 다음 READY 또는 HOLD

1. `harness:status`와 `harness:check`로 READY 단일성을 확인한다.
2. Git SHA·dirty baseline·원격 ref와 파일 수정 시각을 대조한다.
3. Docker 3서비스·보호 listener·예약 관찰 작업을 읽기 확인한다.
4. 저장소·로컬 환경에서 P4-G0 필수 입력의 존재만 확인하고 Secret 값은 출력하지 않는다.
5. 운영 manifest·Compose·배포 fail-closed 계약을 검증한다.
6. 입력이 완전할 때만 `P4-STAGING-PREFLIGHT`로 이동한다. 누락 시 현재 READY를 유지하고 한 번의 HOLD 증거를 남긴다.

## AUTHORITY / PERMISSIONS

- 읽기: 활성 저장소, 로컬 Git·HTTP·DNS·Docker·프로세스·포트·예약 작업, 원격 Git ref
- 로컬 쓰기: 이 실행계약, `P4_G0_STAGING_INPUT_EVIDENCE.json`, 대응 Phase 보고서
- 자동 허용: 비파괴 로컬 구문·계약·Compose·Harness 검증
- 명시적 실제 대상이 확인된 뒤 별도 범위 확인 필요: 공급자 계정/OAuth, Secret 사용, DNS/TLS, staging 배포·migration, Production, 외부 메시지, Git 외부 쓰기

## CONSTRAINTS

- 진행 중 Phase와 READY는 각각 정확히 하나다.
- Docker Compose 서비스는 `frontend`, `backend`, `database` 정확히 3개를 유지한다.
- LM Studio `1234`, Ollama `11434`, bridge/wslrelay `18765`, P3 bridge `18766`, P3 runtime `18767`을 변경하지 않는다.
- 기존 완료 산출물과 사용자 변경을 보존한다.
- hostname 200 응답, 템플릿 통과, Secret 키 이름 존재만으로 실제 staging 준비 완료로 승격하지 않는다.
- 사실·가정·미결정·승인 필요를 분리한다.

## SUCCESS CRITERIA

- Harness 계약 오류가 0건이고 현재 READY가 하나다.
- 실제 staging 전용 hostname·서버·계정과 모든 공급자·PITR·Secret reference가 승인된 출처로 확인된다.
- 비템플릿 manifest가 구조 검증을 통과하고 실제 대상에 대한 `--probe` 준비가 가능하다.
- 보호 listener와 Docker 3서비스가 보존된다.

## FAILURE CRITERIA

- 필수 입력 하나 이상이 없거나 예시값뿐이다.
- 비품관리 staging 전용 대상인지 소유관계가 확인되지 않는다.
- Secret 원문 노출, 보호 서비스 변화, 테스트 실패 또는 승인 없는 외부 변경이 발생한다.
- Harness와 문서의 현재 Phase·READY가 다르다.

## VERIFICATION / EVIDENCE

- `npm.cmd run harness:status`
- `npm.cmd run harness:check`
- `npm.cmd run operations:preflight -- config/operations.manifest.example.json --allow-template`
- `npm.cmd run operations:contracts`
- `npm.cmd run compose:contract`
- `npm.cmd run deploy:check -- .env.production.example`의 의도된 fail-closed 결과
- Git SHA/ref, Docker inspect, listener PID, scheduled task, DNS/HTTPS probe
- 변경 파일, 명령, 종료 코드, 실제 결과와 남은 위험 기록

## OUTPUTS / FORMAT

- 실행계약: `agent docs/prompts/95_P4_G0_Staging_Target_Provider_Resume_실행계약.md`
- 기계 증거: `agent docs/harness/P4_G0_STAGING_INPUT_EVIDENCE.json`
- 사람용 체크리스트·결과: `docs/phase-reports/95_P4_G0_Staging_Target_Provider_Resume.md`
- Secret·토큰·세션·개인정보 원문은 기록하지 않는다.

## MEMORY UPDATE

Phase 상태가 실제로 바뀔 때만 `MASTER_ROADMAP.json`, `docs/roadmap.md`, `docs/current-state.md`를 같은 사실로 갱신한다. 이번 재검사에서 P4-G0이 HOLD이면 상태 정본은 변경하지 않고 증거 파일만 추가한다.

## STOP CONDITION

- P4-G0 입력이 완전하면 P4 staging preflight의 다음 READY 한 건으로 이동한다.
- 입력이 누락되면 외부 변경을 하지 않고 `HOLD_STAGING_INPUT_REQUIRED`를 한 번 기록한 뒤 중단한다.
- 보호 서비스 변화, 보안 위험 또는 동일 원인 실패 3회가 발생하면 즉시 중단한다.
