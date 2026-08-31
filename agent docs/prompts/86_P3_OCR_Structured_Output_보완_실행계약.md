# P3 OCR Structured Output 보완 실행계약

## ROLE:

SQCM-i 비품관리 시스템의 P3 OCR 구조화 출력 보완자.

## GOAL:

llama.cpp OCR 응답을 명시적 JSON Schema로 제약하고 애플리케이션 경계에서 다시 검증하여, 실제 독립 runtime과 backend external adapter의 OCR 호출이 합성 입력으로 성공함을 증명한다.

## SCOPE:

- `src/bridge/llama-runtime-adapter.js`의 OCR 전용 schema-constrained output과 fail-closed 검증
- 관련 단위 테스트와 합성 OCR 실 runtime 검증
- 기존 backend 이미지의 rollback 식별자 보존, backend만 빌드·1회 재연결
- Harness, 로드맵과 P3 Phase 보고서의 실제 증거 갱신

## OUT OF SCOPE:

- frontend·database 재생성 또는 네 번째 Docker 서비스 추가
- DB migration, Production 배포, 실제 비품·개인정보 전송
- 보호 포트 1234·11434·18765 및 기존 PID 변경
- Git stage·commit·push·merge·release
- P3 전체 완료 또는 P4 이후 단계 해제

## WORKFLOW:

1. llama.cpp 공식 server 문서·소스에서 현재 `response_format` schema 형식을 확인한다.
2. OCR 응답의 최상위 `fields`·`confidence`, 추가 속성 금지와 값 제약을 코드·테스트로 고정한다.
3. focused test, 전체 로컬 검사와 repository hygiene를 수행한다.
4. 키 원문을 출력하지 않고 실 runtime에 합성 OCR을 직접 호출한다.
5. 이전 backend 이미지 ID를 rollback 증거로 기록하고 backend만 새 이미지로 빌드한다.
6. external override로 backend를 정확히 한 번 재연결한다.
7. adapter health/ready, 추천, OCR, 3-service health, smoke, 컨테이너 보존과 보호 listener/PID를 검증한다.
8. 실패하면 rules driver로 즉시 복귀하고 자동 재시도 없이 증거를 갱신한다.

## INPUTS / SOURCE OF TRUTH:

- 사용자 승인: `P3 OCR Structured Output 보완 승인`
- 공식 llama.cpp server 문서·소스
- `MASTER_ROADMAP.json`, `P3_RUNTIME_EVIDENCE.json`, 기존 P3 보고서
- 현재 adapter·단위 테스트·Compose 계약과 로컬 runtime/bridge 상태

## AUTHORITY / PERMISSIONS:

허용: 위 allowlist 파일의 최소 편집, 로컬 테스트, 합성 입력, backend 이미지 빌드와 1회 재연결, 실패 시 rules rollback. 금지: frontend/database 변경, 운영·migration, Secret 원문 출력, Git 외부 변경, 보호 서비스 변경.

## SUCCESS CRITERIA:

- OCR 요청이 llama.cpp 공식 schema-constrained 형식을 사용한다.
- OCR 응답이 정확한 `fields`·`confidence` 계약을 만족하며 불일치 응답은 fail-closed 된다.
- focused/전체 검사와 repository hygiene가 통과한다.
- 실 runtime 직접 OCR과 backend service의 추천·OCR이 합성 입력으로 통과한다.
- Docker는 3서비스 healthy이며 frontend/database ID와 보호 listener/PID가 보존된다.

## FAILURE CRITERIA / STOP CONDITION:

- schema가 적용되지 않거나 adapter validation을 우회한다.
- 실 runtime 또는 backend OCR이 실패한다.
- frontend/database 또는 보호 서비스가 변경된다.
- backend 재연결 후 health/smoke가 실패한다.

## VERIFICATION / EVIDENCE:

- prompt contract strict validator
- Node focused unit test, `npm.cmd run check`, `npm.cmd run repository:hygiene`
- 인증된 loopback 실 runtime 합성 OCR
- Compose config/services, container/image/secret mode, adapter health/ready와 service 호출
- `npm.cmd run deploy:smoke`, SQCM-i 37봇·awake 수와 보호 listener/PID
- `npm.cmd run harness:check`

## OUTPUTS / FORMAT:

- adapter·단위 테스트 최소 변경
- P3 runtime evidence, master roadmap, current-state/roadmap 갱신
- `docs/phase-reports/86_P3_OCR_Structured_Output_보완.md`
- P3 현재 상태와 다음 READY 1건을 포함한 결과 보고
