# P4-G1 Staging Operations Manifest Design 실행계약

ROLE:
SQCM-i staging provider·backup manifest 계약 설계자.

GOAL:
Free plan logical backup과 P3 local providers를 표현하면서 활성화되지 않은 후보 manifest가 실제 배포를 승인하지 못하는 fail-closed 계약을 만든다.

SCOPE:
- operations backup 계약의 `pitr|logical` 분리
- candidate·active activation gate
- staging candidate manifest와 실제 확인/차단 상태
- 단위·operations preflight 검증
- Harness·로드맵·현재상태 동기화

OUT OF SCOPE:
- DNS/TLS·tunnel 활성화
- OIDC client·Storage bucket·Secret 생성
- provider HTTPS route 실행
- staging deploy·migration·Production 변경
- commit·push·merge·release

WORKFLOW:
1. 기존 manifest validator와 P3/P4 provider 증거를 확인한다.
2. PITR 강제 계약을 Free plan logical backup 계약과 분리한다.
3. candidate는 구조 검증만 통과하고 기본 preflight는 거부하도록 한다.
4. 알려진 endpoint와 Secret resource name을 candidate에 기록하되 status를 차단으로 유지한다.
5. 단위·syntax·operations 계약과 fail-closed preflight를 검증한다.

INPUTS / SOURCE OF TRUTH:
1. 현재 Goal+Harness와 사용자 자율 진행 승인
2. P3 security/AI evidence, P4 Supabase backup evidence
3. 실제 validator·tests·candidate preflight 결과

AUTHORITY / PERMISSIONS:
- 읽기: 저장소·provider evidence
- 로컬 쓰기: operations validator·test·candidate config·Agent Docs·Harness
- 외부 쓰기: 없음

CONSTRAINTS:
- candidate endpoint를 활성 provider 증거로 승격하지 않는다.
- Secret 값은 candidate와 문서에 넣지 않는다.
- 기본 preflight는 activationState active만 배포 허용한다.
- production PITR 계약은 낮추지 않는다.

SUCCESS CRITERIA:
- PITR manifest 기존 계약 PASS
- logical backup retention·schedule·restore evidence 필수
- candidate 구조 검사 PASS, 기본 배포 preflight FAIL-CLOSED
- 단위·syntax 실패 0
- Secret 패턴 0, 보호 listener 보존

FAILURE CRITERIA / STOP CONDITION:
- candidate가 기본 preflight를 통과한다.
- logical backup이 필수 증거 없이 통과한다.
- Secret 값이 기록되거나 기존 provider가 변경된다.

VERIFICATION / EVIDENCE:
- focused operations unit tests
- `npm.cmd run check:syntax`, `npm.cmd run operations:contracts`
- candidate `--allow-candidate` PASS와 기본 preflight expected FAIL
- JSON parse, Harness check, protected PID

OUTPUTS / FORMAT:
- `config/operations.manifest.staging.candidate.json`
- `agent docs/harness/P4_G1_STAGING_MANIFEST_DESIGN_EVIDENCE.json`
- `docs/phase-reports/108_P4_G1_Staging_Operations_Manifest_Design.md`
- 상태 정본 동기화
