# P6-G1 Production Target·Provider Input 실행계약

기준일: 2026-09-01

ROLE: SQCM-i 비품관리 Production 전환 입력을 증거 기반으로 고정하는 코드→운영 Gate 관리자다.

GOAL: 원격에 고정된 release candidate, 전용 hostname, 분리된 Supabase, 변경 시간·책임자와 전용 deployment runner의 실제 입력을 확인하고 P6-G2 진입 가능 여부를 fail-closed로 판정한다.

SCOPE:
- Git branch·SHA·원격 ref·PR·CI 상태
- Production hostname 후보와 기존 SQCM-i OS route 충돌
- Supabase 조직·staging project·Production project 비용 및 분리 조건
- Production runtime/runner, 변경 시간, 실행·rollback 책임자 입력
- Supabase changelog와 backup/PITR 운영 제약
- Harness·roadmap·current-state의 현재 사실 동기화

OUT OF SCOPE:
- Supabase Production project 생성·결제 확정
- commit·push·PR·merge·release·원격 CI 유발
- DNS/TLS 게시, Secret 생성·입력, Production 배포·migration
- 37봇, AI PC bridge/runtime와 보호 listener 변경

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자의 요청과 장기 Goal+Harness 권한 경계
2. 프로젝트 `AGENTS.md`, `CLAUDE.md`, `docs/current-state.md`, `docs/roadmap.md`
3. `agent docs/harness/MASTER_ROADMAP.json`
4. 실제 GitHub branch/PR/Actions, Supabase 조직/project/cost 조회 결과
5. Supabase 공식 changelog·backup 문서와 실제 저장소 구성

WORKFLOW:
Inspect → Harness 계약 검사 → Git 원격 기준선 → 공급자 사전검토 → 비용 조회 → runtime/change-window 공백 확인 → 증거 기록 → 다음 Gate 판정

AUTHORITY / PERMISSIONS:
- 로컬·원격 읽기와 allowlist 문서/Harness 갱신은 자동 허용한다.
- 비용 확인은 읽기 전용으로 수행한다.
- 비용 동의, project 생성, PR·CI·merge·release, DNS/TLS, Secret, Production 변경은 정확한 대상과 사용자의 명시 승인 전 실행하지 않는다.

SUCCESS CRITERIA:
- 전용 hostname, 분리된 Production Supabase project ID·region·plan, 정확한 release candidate, 변경 시간·책임자, 전용 runner가 모두 실제 값으로 확정된다.
- current SHA에 대한 PR CI와 불변 이미지 생성은 P6-G2에서 수행할 수 있도록 대상이 명확하다.
- 운영 backup/PITR·RPO/RTO 정책과 비용 동의가 기록된다.

FAILURE CRITERIA:
- staging project 재사용, 기존 SQCM-i OS hostname 충돌, AI PC/37봇 호스트의 무승인 Production 전용
- Production project·runner·변경 시간이 추정값뿐이거나 비용 동의가 없다.
- current SHA의 PR/CI 없이 Production release candidate로 승격한다.

VERIFICATION / EVIDENCE:
- `npm.cmd run harness:status`, `npm.cmd run harness:check`
- `git status --short`, `git rev-parse HEAD`, `git ls-remote`
- GitHub REST의 open PR·Actions run 조회
- Supabase 조직/project/cost 도구와 공식 changelog·backup 문서
- `git diff --check`, Secret/credential pattern 검사

OUTPUTS / FORMAT:
- `agent docs/harness/P6_G1_PRODUCTION_TARGET_PROVIDER_INPUT_EVIDENCE.json`
- `docs/phase-reports/121_P6_G1_Production_Target_Provider_Input.md`
- 상태 정본의 P6 최신 증거와 READY

STOP CONDITION:
- 외부 입력이 모두 확정되면 P6-G2로 이동한다.
- 비용 동의·Production project·runtime·변경 시간이 남으면 `HOLD_EXTERNAL_INPUTS_PARTIALLY_RESOLVED`로 한 번 보고하고 대기한다.
- Production과 보호 서비스는 변경하지 않는다.
