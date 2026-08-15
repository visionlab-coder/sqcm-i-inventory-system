# 서원토건 비품관리 프로젝트 지침

이 파일은 프로젝트별 차이만 정의한다. 공통 작업 계약과 상세 절차는 사용자 환경의 최신 전역지침과 해당 `bamsoft-*` Skill을 단일 정본으로 사용한다.

## 입력 정본과 우선순위

1. 현재 사용자의 명시적 요구
2. `client docs`의 승인된 원본 요구사항
3. `develop docs`의 승인된 설계
4. 이 파일과 `AGENTS.md`
5. `agent docs/Agent.md`의 현재 상태·결정·READY
6. 실제 코드·DB migration·테스트·CI 증거

설명과 실제 상태가 다르면 코드·실행 증거를 우선하고 차이를 보고한다. 과거 Phase 보고서는 역사 증거이며 현재 상태 정본이 아니다.

## 프로젝트 맥락

- Frontend: Nginx 정적 SPA
- Backend: Node.js 24·Express JSON API
- Database: PostgreSQL 16
- 인증·보안: 세션, RBAC, 조직/부서 범위, CSRF, BCrypt, MFA, Helmet
- Docker: `frontend`, `backend`, `database` 정확히 3서비스
- 데이터 흐름: Browser → Endpoint/Controller → Service → Repository → PostgreSQL → 반대 방향 응답

## 디렉터리 책임

- `client docs`: 승인된 원본 요구사항
- `develop docs`: 설계·테스트·배포·운영 문서
- `agent docs`: 실행 프롬프트와 최소 Memory
- `docs/phase-reports`: Phase별 실행 증거
- `frontend`: 실제 SPA
- `src`: Backend 계층과 업무 로직
- `db/migrations`: forward-only DB 변경
- `test`: 단위·통합 검증
- `mock`: 화면 산출물만 보관하며 제작 프롬프트·모델 메타데이터는 금지

## Skill 라우팅

- 전체 단계·잔여 작업: `bamsoft-web-process-11`
- 일회성·장기 메타프롬프트: `bamsoft-prompt-engineering`
- 로그인·MFA·세션·RBAC: `bamsoft-login-lifecycle`
- 화면·컨셉·HTML Mock: `bamsoft-screen-form-design`
- Docker·CI·배포·롤백: `bamsoft-code-to-production-8`
- 외부 Plugin·MCP·OAuth·공급자 연결 전: `bamsoft-integration-preflight`
- 세션 인계: `bamsoft-session-handoff-cleanup`

과거 프로젝트 12단계 보고서는 보존한다. 새 작업은 `bamsoft-web-process-11` 게이트를 사용하며 다음처럼 대응한다.

- 프로젝트 폴더·목표 → 1 목표
- Docs → 2 문서
- 요구사항 → 3 요구사항
- 기능 → 4 기능
- 인프라 → 5 인프라
- DB → 6 DB
- 화면 → 7 화면
- 기능개발·단위 테스트 → 8 개발
- 배포 → 9 배포
- 통합·브라우저 테스트 → 10 통합 테스트
- 유지보수 → 11 유지보수

## 실행·검증 명령

```powershell
npm.cmd run check
npm.cmd run ui:contract
docker compose -f compose.yaml -f compose.test.yaml up -d --build
npm.cmd run check:full
npm.cmd run deploy:smoke
npm.cmd run maintenance:check
```

실제 환경변수가 필요한 명령은 승인된 Secret 주입 후 실행한다. 실행하지 않은 결과를 완료로 기록하지 않는다.

## 프로젝트 불변식

- Docker 서비스는 frontend/backend/database 3개만 둔다.
- 운영에서 backend와 database 포트를 호스트에 공개하지 않는다.
- Controller에 SQL·복잡한 업무 규칙을 넣지 않는다.
- 권한과 데이터 범위는 API·Service·Repository 쿼리에서 재검사한다.
- 재고·상태·승인·감사 변경은 트랜잭션과 DB 제약으로 보호한다.
- 비밀번호·토큰·세션 원문·운영 Secret을 코드·문서·로그·커밋에 남기지 않는다.
- 파란 배경은 공식 반전 로고, 밝은 배경은 공식 컬러 로고를 사용한다.
- 컨셉아트·HTML Mock에는 제작 도구·프롬프트·모델 메타데이터를 노출하지 않는다.

## 외부 변경 경계

운영 배포·migration, OAuth 동의, Secret 사용, DNS/TLS, 협업자 권한, merge, 실제 데이터 전송은 정확한 대상과 환경에 대한 사용자 승인이 필요하다. 현재 Production은 운영 공급자·UAT·백업/PITR·전환 승인 증거가 모두 통과하기 전까지 NO-GO다.
