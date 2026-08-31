# P4-G1 Staging Provider Routes·Secret Bindings 실행계약

기준일: 2026-08-31

ROLE:

SQCM-i staging 외부 공급자 연결 실행자다. 한 Loop에서 현재 READY 한 건만 수행하고 실제 증거 없이 활성화나 완료를 선언하지 않는다.

GOAL:

전용 Supabase project와 Cloudflare staging hostname에 Storage·OIDC·보안·AI·event provider를 최소권한으로 연결하고, Secret 원문 없이 재현 가능한 live evidence를 남긴다.

SCOPE:

- Supabase project `iuoljosldyymkburagwj`의 private Storage bucket, S3 server credential, OAuth Server와 staging confidential client
- `inventory-staging.safe-link.co.kr` 전용 tunnel·DNS의 안전한 활성화 준비
- provider adapter 코드·테스트, protected `.env.staging.local`, operations manifest와 P4 evidence

OUT OF SCOPE:

- Production·SAFE-LINK project 변경, 실제 업무 데이터·실사용자 생성, commit·push·merge·release
- seed credential이 있는 synthetic stack의 인터넷 공개
- 기존 37봇·Docker 3서비스·1234·11434·18765 listener 변경

WORKFLOW:

Inspect → integration preflight → private Storage → OAuth/OIDC client → adapter contract → live probe → 공개 전 역조건 → evidence·Harness 동기화. 동일 원인 실패가 3회면 중단한다.

INPUTS / SOURCE OF TRUTH:

사용자 승인, `AGENTS.md`, `CLAUDE.md`, `config/operations.manifest.staging.candidate.json`, `MASTER_ROADMAP.json`, 실제 Supabase·Cloudflare·코드·테스트 상태 순으로 판정한다.

AUTHORITY / PERMISSIONS:

사용자가 승인한 전용 Supabase Storage·OAuth Secret과 전용 Cloudflare DNS 생성·연결만 외부 쓰기한다. Secret 값은 ignored protected file에만 저장하며 로그·문서·Git에 기록하지 않는다.

SUCCESS CRITERIA:

- private bucket이 5 MiB와 JPEG·PNG·PDF 제한을 갖고 write/read/delete probe가 통과한다.
- ES256 OIDC discovery, exact HTTPS callback, confidential client와 PKCE 계약이 확인된다.
- 실제 adapter contract·unit test가 통과한다.
- seed·미완성 consent UI가 공개되지 않고, 공개 역조건 충족 후에만 DNS·connector를 활성화한다.
- Harness와 문서가 실제 완료·보류 상태와 일치한다.

FAILURE CRITERIA:

Secret 노출, public bucket, dynamic client registration, callback 불일치, seed stack 공개, 보호 listener 변경, adapter test 실패 또는 consent/user provisioning 부재 시 READY 완료로 전환하지 않는다.

VERIFICATION / EVIDENCE:

`npm.cmd run check`, provider focused tests, Supabase discovery·S3 synthetic object probe, DNS·tunnel readback, `npm.cmd run harness:check`, Secret pattern scan와 listener PID를 기록한다.

OUTPUTS / FORMAT:

코드·테스트, `agent docs/harness/P4_G1_PROVIDER_BINDING_EVIDENCE.json`, Phase 보고서와 로드맵을 갱신한다. 모든 산출물에서 Secret·토큰·세션·개인정보 원문을 제외한다.

CONSTRAINTS:

- Docker 서비스는 `frontend`, `backend`, `database` 3개만 유지한다.
- Storage bucket은 private이며 dynamic OAuth registration은 비활성이다.
- Secret 값은 ignored protected file 이외에 기록하지 않는다.

STOP CONDITION:

READY 수용조건을 모두 충족하면 다음 Gate로 이동한다. 실제 사용자 provisioning·동의 UI 또는 안전한 staging 배포가 없으면 DNS를 게시하지 않고 정확한 blocker를 남긴다.
