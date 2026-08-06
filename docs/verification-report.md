# 검증 보고서 — 2026-08-06

## 결과 요약

| 검증 | 결과 |
|---|---|
| JavaScript 구문 검사 | 통과 |
| 단위 테스트 | 8/8 통과 |
| PostgreSQL 등록·대여·반납 통합 테스트 | 1/1 통과 |
| 프론트 health·API 프록시·로그인·대시보드 통합 테스트 | 1/1 통과 |
| Docker `frontend` health | healthy |
| Docker `backend` health | healthy |
| Docker `database` health | healthy |
| 브라우저 로그인·대시보드 | 통과 |
| 공식 로고 로그인·사이드바 렌더링 | 통과 |
| 임시 로고 잔존 검사 | 0건 |
| 콘셉트 페이지 공식 로고 적용 | 11/11 |
| Canva·Figma 기반 페이지 아키타입 | 11/11 |
| 개편 UI 브라우저 화면 전환 | 로그인·대시보드·비품·대여 통과 |
| 컨셉 PNG 제작 메타데이터 | `caBX` 12/12 제거 |
| 컨셉·HTML mock 표시 메타데이터 | 제거 완료 |
| 메타데이터 제거 후 브라우저 렌더링 | 컨셉·HTML mock 통과 |

## 실행 명령

```powershell
npm.cmd run check
docker compose -f compose.yaml -f compose.test.yaml up -d --build
$env:INTEGRATION_DATABASE_URL='postgres://seowon:change-me@localhost:55432/seowon_inventory'
$env:INTEGRATION_BASE_URL='http://localhost:3000'
$env:SEED_MANAGER_PASSWORD='Manager1234!'
npm.cmd run test:integration
docker compose -f compose.yaml -f compose.test.yaml ps
```

## 브라우저 증거

- `mock/screenshots/three-tier-login.png`
- `mock/screenshots/three-tier-dashboard.png`
- `mock/screenshots/official-logo-login.png`
- `mock/screenshots/official-logo-dashboard.png`
- `mock/screenshots/reference-v2-login.png`
- `mock/screenshots/reference-v2-dashboard.png`
- `mock/screenshots/reference-v2-catalogue.png`
- `mock/screenshots/reference-v2-handover.png`
- `mock/screenshots/reference-v2-concepts.png`

로그인 화면의 이메일·비밀번호·로그인 요소를 확인했고, 담당자 계정 로그인 후 대시보드 제목, 메뉴, 비품 현황 데이터가 렌더링됨을 확인했다. 빈 화면과 애플리케이션 오류 오버레이는 없었다.

공식 로고 변경 후 로그인 화면과 대시보드 사이드바에서 `SEOWON Since 1991` 자산이 로드되고 올바른 비율로 표시됨을 시각 검증했다.

Canva·Figma 레퍼런스 기반 개편 후 로그인 에디토리얼 히어로, 비대칭 지휘판, 비품 카탈로그, 단계형 인계 화면이 서로 다른 레이아웃으로 렌더링되고 메뉴 전환이 정상 작동함을 확인했다. 콘셉트 갤러리는 11개 업무별 HTML/CSS 아키타입을 포함한다.

## 개선 루프

초기 `frontend` healthcheck가 Nginx 안에서 `localhost` 해석 문제로 실패했으나 외부 화면과 API는 정상이었다. 헬스 대상 주소를 `127.0.0.1`로 명시하고 프론트엔드를 재빌드해 세 컨테이너 모두 `healthy`가 됨을 재검증했다.

## 판정

프론트엔드·백엔드·데이터베이스를 분리한 로컬 3계층 배포와 핵심 기능 검증이 완료됐다. 운영 배포 전에는 기본 비밀 변경, HTTPS, 백업·복구 훈련이 필요하다.
