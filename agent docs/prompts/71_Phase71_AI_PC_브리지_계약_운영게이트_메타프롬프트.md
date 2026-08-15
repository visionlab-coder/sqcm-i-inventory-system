# Phase 71 — AI PC 브리지 계약·운영 게이트 정합성 메타프롬프트

ROLE:
비품관리 Cost Control의 AI 연동 계약과 운영 사전검사를 책임지는 시니어 백엔드·보안 엔지니어다.

GOAL:
현재 HTTP AI adapter, AI PC 브리지 명세, production operations manifest가 동일한 도메인 계약을 사용하도록 정렬하고, 실제 AI PC endpoint가 없으면 외부 호출 없이 HOLD로 종료한다.

USERS / EXPECTED CHANGE:
- 백엔드 개발자: `/recommend`, `/ocr`, `/health` 계약을 한 곳에서 구현한다.
- 운영자: production 전에 AI endpoint·model·secret·readiness를 검증한다.
- 업무 책임자: 외부 AI가 연결되기 전까지 rules fallback이 유지됨을 확인한다.

CONTEXT:
- 현재 브랜치: `agent/productization-completion-chain`
- 실제 provider: `AI_PROVIDER_DRIVER=rules`
- 현재 adapter는 OpenAI Chat Completions 요청을 보내지만 Phase 67 브리지는 domain JSON `/recommend`를 요구한다.
- AI PC의 실제 endpoint·독립 runtime·운영 Secret은 제공되지 않았다.
- 기존 LM Studio, SONOL BOT, 1234·18765 포트는 변경 금지다.

SCOPE:
- `src/adapters/http-ai-provider.js`, `src/config.js`, `src/operations/gates.js`, `scripts/ai-bridge-preflight.mjs`
- `config/operations.manifest.example.json`, `.env.production.example`, 관련 단위 테스트와 운영 문서
- domain JSON 요청·응답 schema, auth·timeout·readiness·modelVersion·secret reference gate

OUT OF SCOPE:
- AI PC 프로세스 시작·종료·재설정
- LM Studio 또는 SONOL BOT 직접 호출
- 실제 Secret 입력, 외부 AI 데이터 전송, production 배포, DNS/TLS 변경

INPUTS / SOURCE OF TRUTH:
1. 현재 코드와 테스트
2. `agent docs/58_Phase66_69_AI_PC_브리지_활성화_체인_메타프롬프트.md`
3. `docs/phase-reports/69_AI_PC_브리지_발견결과_STOP.md`
4. 프로젝트의 새 AGENTS 정책과 `bamsoft-prompt-engineering` 계약

WORKFLOW:
1. 기존 adapter와 Phase 67 schema의 차이를 재현하는 단위 테스트를 먼저 작성한다.
2. `/recommend`는 `{organizationId, query, assets}`를 보내고, `/ocr`는 명시된 OCR payload를 보낸다. 응답은 직접 domain JSON만 허용한다.
3. manifest·production env example·preflight·gate가 AI provider URL 3종, modelVersion, 인증 참조, readiness를 요구하도록 최소 변경한다.
4. rules 모드와 외부 endpoint 미구성 상태에서 기존 테스트와 fallback을 재검증한다.
5. 변경 파일·명령·종료 결과·남은 외부 gate를 보고한다.

AUTHORITY / PERMISSIONS:
- 읽기: 저장소·문서·테스트 전체
- 로컬 쓰기: 위 범위의 코드·테스트·문서만
- 외부 PC·프로세스·Secret·DNS·배포: 승인 없이는 수행하지 않는다.

CONSTRAINTS:
- 조직 범위와 assetId allow-list를 유지한다.
- 타 조직 자산·개인정보·Secret을 외부로 보내지 않는다.
- provider 실패 시 rules fallback을 유지한다.
- 기존 완료 산출물·AGENTS.md·CLAUDE.md·agent docs를 삭제하지 않는다.

SUCCESS CRITERIA:
- adapter와 bridge 문서가 동일한 domain JSON contract를 사용한다.
- operations manifest와 preflight가 AI provider 누락·HTTP·model·secret reference를 fail-closed로 판정한다.
- `npm.cmd run check`, `npm.cmd run ui:contract`가 통과한다.
- 실제 endpoint가 없을 때 외부 호출 없이 `HOLD/BLOCKED`를 보고한다.

FAILURE CRITERIA / STOP CONDITION:
- 기존 LM Studio·SONOL BOT 접근이 필요함
- domain contract를 확정할 수 없음
- 테스트 실패가 같은 원인으로 3회 반복됨
- Secret·외부 전송·운영 변경이 필요함

VERIFICATION / EVIDENCE:
- `npm.cmd run check`
- `npm.cmd run ui:contract`
- `npm.cmd run ai:preflight`
- `git diff --check`
- 변경 전후 단위 테스트, manifest gate 결과, 실제 endpoint 미구성 증거

OUTPUTS / FORMAT:
- 코드·테스트·문서 diff
- Phase 71 보고서
- PASS/HOLD/FAIL 판정과 다음 READY 1건

MEMORY UPDATE:
`docs/phase-reports/71_AI_PC_브리지_계약_운영게이트.md`와 `agent docs/Agent.md`의 최신 상태만 갱신한다. Secret·응답 원문은 기록하지 않는다.

STOP CONDITION:
실제 AI PC endpoint·모델·Secret·UAT 승인 없이는 `AI_PROVIDER_DRIVER=external`로 전환하거나 Production GO를 선언하지 않는다.

USERS:
Backend 개발자, 운영 담당자, Cost 업무 책임자와 AI PC 운영자가 이 계약을 사용한다. AI PC 운영자는 기존 LM Studio·SONOL BOT을 보존한 채 독립 브리지 증거를 제공한다.

TOOLS:
읽기 전용 PowerShell과 저장소 파일 조회, Node.js 테스트·preflight, prompt contract validator만 사용한다. 외부 서비스 변경·프로세스 기동·종료·secret 입력은 사용하지 않는다.
