# SQCM-i 서원토건 비품관리 시스템

서원토건 구성원이 비품의 입고, 재고, 대여, 반납과 감사 이력을 한 곳에서 관리하는 교육용 웹 애플리케이션입니다.

## 핵심 범위

- 세션 기반 로그인과 `ADMIN`/`MANAGER`/`USER` 권한
- 비품 등록·검색, 재고 부족 표시
- 비품 대여·반납과 연체 상태
- 대시보드와 감사 로그
- PostgreSQL 영속화와 Docker Compose 3계층 실행

## Docker 3계층 구성

| 서비스 | 역할 | 컨테이너 포트 | 호스트 공개 |
|---|---|---:|---:|
| `frontend` | Nginx 정적 SPA 및 `/api` 리버스 프록시 | 80 | 3000 |
| `backend` | Express JSON API, 인증·권한·업무 규칙 | 8080 | 비공개 |
| `database` | PostgreSQL 16 데이터 저장 | 5432 | 비공개 |

브라우저 요청은 `frontend → backend → database` 순으로 전달됩니다. 운영 Compose에서는 프론트엔드만 호스트에 공개합니다.

## 빠른 실행

```powershell
powershell -ExecutionPolicy Bypass -File scripts/new-local-env.ps1
docker compose up -d --build
docker compose ps
```

브라우저에서 `http://localhost:3000`에 접속합니다.

- 관리자: `admin@seowon.local`
- 비품 담당자: `manager@seowon.local`
- 현장 직원: `employee@seowon.local`

시드 비밀번호와 DB·세션 비밀값은 실행 시 `.env`에 무작위 생성되며 화면이나 명령 출력에 표시하지 않습니다. `.env`는 Git 추적 대상이 아닙니다.

## 운영 배포

운영에서는 로컬 기본값을 사용하지 않고 별도 환경 파일과 production override를 적용합니다.

```powershell
Copy-Item .env.production.example .env.production
# .env.production의 예시값을 안전한 실제 값으로 교체
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 `
  -EnvFile .env.production -ProjectName seowon-inventory
```

상세한 사전검사·상태확인·롤백 절차는 [`develop docs/12_배포_런북.md`](./develop%20docs/12_배포_런북.md)를 따릅니다.

## 검증

```powershell
npm.cmd run check
docker compose -f compose.yaml -f compose.test.yaml up -d --build
Get-Content .env | Where-Object { $_ -match '^[A-Z0-9_]+=' } | ForEach-Object { $name, $value = $_.Split('=', 2); [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
$env:INTEGRATION_BASE_URL='http://localhost:3000'
$env:INTEGRATION_DATABASE_URL=$env:DATABASE_URL -replace ':5432/', ':55432/'
npm.cmd run check:full
```

`npm run check`는 skip 없는 단위 품질 게이트이고, `npm run test:integration`은 두 통합 환경변수가 없으면 실패합니다. GitHub Actions는 PR과 `main` push에서 단위 검사와 Docker 3계층 통합 검사를 별도 Job으로 실행합니다.

## 유지보수

```powershell
$env:MAINTENANCE_BASE_URL='http://localhost:3000'
$env:MAINTENANCE_DATABASE_URL='비밀저장소에서_주입'
npm.cmd run maintenance:check
npm.cmd run db:backup
npm.cmd run db:restore-drill -- "artifacts/backups/백업파일.dump"
```

운영 점검 주기와 안전한 복구 절차는 [`develop docs/13_유지보수_런북.md`](./develop%20docs/13_유지보수_런북.md)를 따릅니다. 백업 파일은 Git 추적에서 제외됩니다.

## 문서

- 고객 문서: [`client docs`](./client%20docs)
- 개발 문서: [`develop docs`](./develop%20docs)
- 에이전트 문서: [`agent docs`](./agent%20docs)
- 단계별 보고서: [`docs/phase-reports`](./docs/phase-reports)
- 최신 단일 현황: [`docs/current-state.md`](./docs/current-state.md)
- 검증 보고서: [`docs/verification-report.md`](./docs/verification-report.md)
- 화면 목업: [`mock/html/index.html`](./mock/html/index.html)
- 페이지별 콘셉트 아트: [`mock/concept/pages/index.html`](./mock/concept/pages/index.html)
- 기업형 FR 구현 대조표: [`develop docs/15_기업형_FR_구현대조표.md`](./develop%20docs/15_기업형_FR_구현대조표.md)
- 기업형 확장 보고서: [`docs/phase-reports/14_기업형_확장_보완.md`](./docs/phase-reports/14_기업형_확장_보완.md)
- 공식 로고 지침: [`develop docs/08_브랜드_로고_지침.md`](./develop%20docs/08_브랜드_로고_지침.md)
- Canva·Figma UI 개편: [`develop docs/09_Canva_Figma_레퍼런스_개편.md`](./develop%20docs/09_Canva_Figma_레퍼런스_개편.md)
- 전체 프롬프트 아카이브: [`agent docs/03_전체_프롬프트_아카이브.md`](./agent%20docs/03_전체_프롬프트_아카이브.md)
- 전역지침 1:1 보완 체크: [`develop docs/14_전역지침_1대1_보완체크리스트.md`](./develop%20docs/14_전역지침_1대1_보완체크리스트.md)

현재 로컬 Docker 3계층 구성과 핵심 기능 검증을 완료했습니다. 외부 배포와 GitHub 협업자 초대는 별도 배포 정보 및 정확한 GitHub 사용자명 확인 후 진행합니다.
