# Phase 72 메타프롬프트 — 사무실 AI PC 격리형 브리지 인프라 설계

ROLE:
범소프트 인프라·보안 설계자. 기존 LM Studio와 SONOL BOT을 보존하면서 비품관리 Cost Control 전용 AI 브리지의 운영 계약과 사무실 AI PC 배치 설계를 만든다.

GOAL:
백엔드가 사무실 내부의 독립 브리지와 인증된 HTTPS 계약으로만 통신하도록 경계를 고정하고, 포트·방화벽·TLS·시크릿·서비스 수명주기·관찰성·롤백을 실제 설치 가능한 런북으로 문서화한다. 설계 문서만으로 실제 AI PC 프로세스가 실행되었다고 간주하지 않는다.

INPUTS / SOURCE OF TRUTH:
- 프로젝트 정본: `AGENTS.md`, `CLAUDE.md`, `agent docs/Agent.md`, `docs/phase-reports/69_AI_PC_브리지_발견결과_STOP.md`
- 애플리케이션 계약: `src/adapters/http-ai-provider.js`, `src/config.js`, `scripts/ai-bridge-preflight.mjs`, `config/operations.manifest.example.json`
- 환경: Windows 사무실 AI PC, 기존 LM Studio `1234`, 기존 SONOL BOT/브리지 `18765`는 사용자 소유로 변경 금지. 신규 브리지 후보 `18766`은 예약 제안일 뿐 점유 확인 전 사용하지 않는다.

SCOPE:
1. 논리·물리 토폴로지와 신뢰 경계를 설계한다.
2. `/health`, `/ready`, `/recommend`, `/ocr`의 네트워크·인증·JSON 계약을 설명한다.
3. Windows 서비스 계정, 방화벽 allowlist, 내부 CA/mTLS 또는 bearer secret, 로그·메트릭·백업·롤백을 정의한다.
4. 사전점검→설치 승인→브리지 기동→애플리케이션 연결→파일럿→운영 전환의 게이트와 증거 양식을 만든다.

OUT OF SCOPE:
기존 LM Studio/SONOL BOT 종료·재설정·모델 추출, 포트 선점 프로세스 종료, 임의 runtime/model 설치, AI PC 원격 실행, DNS/TLS 발급, 운영 배포·commit·push.

WORKFLOW:
1. 현재 파일·포트·프로세스 증거를 읽기 전용으로 확인한다.
2. 앱 계약과 보안 제약을 설계 입력으로 고정한다.
3. 토폴로지·운영 런북·전환 게이트를 작성한다.
4. 문서와 메타프롬프트를 strict 계약 검사하고 로컬 테스트를 실행한다.
5. 실제 AI PC 증거가 없으면 `HOLD`로 남기고 다음 승인 입력만 만든다.

AUTHORITY / PERMISSIONS:
사용자 요구와 저장소 문서를 우선한다. 읽기 전용 점검은 자동 수행할 수 있으나 외부 시스템 변경, 서비스 기동·종료, 방화벽·인증서·DNS·시크릿·운영 배포는 사용자 승인과 AI PC 운영자의 실행 증거가 필요하다. 비밀번호·토큰·프롬프트·개인정보를 로그나 문서에 기록하지 않는다. production은 HTTPS와 조직 범위를 fail-closed로 유지한다.

SUCCESS CRITERIA:
성공: 기존 포트 보존, 브리지 계약의 네 endpoint와 인증·조직 경계·타임아웃·fallback·관찰성·롤백이 문서와 코드 설정에 일치하고 prompt contract 8/8 및 관련 테스트가 통과한다. 실패/중단: 실제 runtime·모델·health/ready·TLS·secret·방화벽 증거가 없거나 기존 프로세스 변경이 필요하면 설치하지 않고 `HOLD`로 보고한다.

VERIFICATION / EVIDENCE:
`python .../validate_prompt_contract.py <this-file> --strict --json`, `npm run check`, `npm run ui:contract`, `npm run ai:preflight`, `git diff --check`의 실제 종료 결과를 기록한다. AI PC 연결은 health/ready HTTP 상태·모델 버전·인증 성공·조직 경계·fallback·감사 로그로 별도 검증한다.

OUTPUTS / FORMAT:
`develop docs/31_사무실_AI_PC_인프라_설계.md`, `docs/phase-reports/72_사무실_AI_PC_인프라_설계.md`와 검증 결과를 남긴다. 실제 변경·미완료·외부 승인·다음 READY 작업만 `agent docs/Agent.md` 상태에 추가하며 기존 사용자 문서는 삭제·reset하지 않는다.

FAILURE CRITERIA / STOP CONDITION:
실제 AI PC 접근 또는 기존 프로세스 변경이 필요하거나, 같은 원인의 테스트 실패가 3회 반복되거나, secret·개인정보를 외부로 보내야 하면 즉시 `HOLD`로 중단한다.

CONSTRAINTS:
기존 LM Studio·SONOL BOT·포트는 보존한다. 독립 runtime·모델·endpoint 증거가 없으면 설치하지 않는다. AI 추천은 권한 부여나 자동 구매 실행을 대신하지 않는다.

MEMORY UPDATE:
현재 결정과 증거, `HOLD` 사유와 다음 READY 입력만 Agent 문서와 Phase 보고서에 남긴다. Secret 값, prompt 원문, 개인정보는 기록하지 않는다.

STOP CONDITION:
AI PC runtime·모델·TLS·인증·health/ready·UAT 증거가 모두 승인되기 전에는 `AI_PROVIDER_DRIVER=external` 활성화나 Production GO를 선언하지 않는다.

USERS:
Backend 개발자, 사무실 AI PC 운영자, 보안 담당자와 Cost 업무 책임자가 이 설계를 사용한다. 각 사용자는 자신의 승인 범위 안에서만 실행 증거를 제공한다.

CONTEXT:
현재 앱은 `AI_PROVIDER_DRIVER=rules`이며 실제 AI PC bridge listener와 독립 runtime은 확인되지 않았다. 기존 LM Studio 1234와 SONOL BOT/18765는 보존 대상이다.

TOOLS:
읽기 전용 PowerShell, 저장소 문서·코드 조회, prompt contract validator와 Node.js 검증 명령을 사용한다. AI PC 서비스 기동·종료, 방화벽·DNS·TLS·secret 변경은 수행하지 않는다.
