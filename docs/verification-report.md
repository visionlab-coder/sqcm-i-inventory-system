# 검증 보고서 — 2026-08-06

## 결과 요약

| 검증 | 결과 |
|---|---|
| JavaScript 구문 검사 | 통과 |
| 단위 테스트 | 17/17 통과 |
| 전체 자동 테스트 | 20/20 통과 / 실패·skip 0건 |
| PostgreSQL 등록·대여·반납 통합 테스트 | 1/1 통과 |
| Docker HTTP CSRF·RBAC·CRUD 통합 테스트 | 1/1 통과 |
| 비품 수정·비활성화 수량 무결성 | 통과 |
| 프론트 health·API 프록시·로그인·대시보드 통합 테스트 | 1/1 통과 |
| Docker `frontend` health | healthy |
| Docker `backend` health | healthy |
| Docker `database` health | healthy |
| 브라우저 로그인·대시보드 | 통과 |
| 브라우저 비품 상세·수정 화면 | 통과 / 오류 0건 |
| 공식 로고 로그인·사이드바 렌더링 | 통과 |
| 파란 배경 공식 반전 로고 자산 | 200 / `image/png` / 6,848 bytes |
| 반전 로고 브라우저 콘솔·오류 오버레이 | 오류 0건 |
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
- `mock/screenshots/phase8-item-detail.png`
- `mock/screenshots/phase10-integration-audit.png`
- `mock/screenshots/reference-v2-login.png`
- `mock/screenshots/reference-v2-dashboard.png`
- `mock/screenshots/reference-v2-catalogue.png`
- `mock/screenshots/reference-v2-handover.png`
- `mock/screenshots/reference-v2-concepts.png`

로그인 화면의 이메일·비밀번호·로그인 요소를 확인했고, 담당자 계정 로그인 후 대시보드 제목, 메뉴, 비품 현황 데이터가 렌더링됨을 확인했다. 빈 화면과 애플리케이션 오류 오버레이는 없었다.

공식 로고 변경 후 로그인 화면과 대시보드 사이드바에서 `SEOWON Since 1991` 공식 반전 자산이 153×47 원본 비율로 로드됨을 확인했다. 남색 배경 위의 파란 워드마크는 흰색으로 전환됐고 주황색 O는 유지됐다. 밝은 배경의 컬러형은 그대로 유지했다.

Canva·Figma 레퍼런스 기반 개편 후 로그인 에디토리얼 히어로, 비대칭 지휘판, 비품 카탈로그, 단계형 인계 화면이 서로 다른 레이아웃으로 렌더링되고 메뉴 전환이 정상 작동함을 확인했다. 콘셉트 갤러리는 11개 업무별 HTML/CSS 아키타입을 포함한다.

Phase 8에서는 관리자 비품 상세 화면의 현재 수량·위치·활성 대여·가용 제외 수량·수정 폼·비활성화 버튼을 확인했다. 수정 요청 성공 메시지가 표시됐으며 가용 제외 수량보다 총수량을 낮추는 변경과 활성 대여 비품의 비활성화는 DB 통합 테스트에서 409로 거부됨을 검증했다.

Phase 9에서는 서비스 계층 단위 테스트 9개를 추가했다. 등록·수정·비활성화의 커밋과 감사 로그, 중복 코드·수량 축소·활성 대여·재고 초과·중복 반납의 409와 롤백, 분실 반납의 재고 미복원을 검증했다. 단위 17/17과 통합 2/2를 합친 전체 19/19가 통과했다.

Phase 10에서는 실제 Nginx `/api` 프록시를 통해 익명 401, CSRF 누락 403, MANAGER·ADMIN RBAC, 비품 CRUD, 대여·반납, 409 경계조건과 감사 로그를 연결했다. 통합 3/3과 단위 17/17을 합친 전체 20/20이 통과했다. 브라우저에서는 비품 상세와 감사 로그 20행을 확인했고 오류는 없었다.

## 개선 루프

초기 `frontend` healthcheck가 Nginx 안에서 `localhost` 해석 문제로 실패했으나 외부 화면과 API는 정상이었다. 헬스 대상 주소를 `127.0.0.1`로 명시하고 프론트엔드를 재빌드해 세 컨테이너 모두 `healthy`가 됨을 재검증했다.

## 판정

프론트엔드·백엔드·데이터베이스를 분리한 로컬 3계층 배포와 핵심 기능 검증이 완료됐다. 운영 배포 전에는 기본 비밀 변경, HTTPS, 백업·복구 훈련이 필요하다.
