# 검증 보고서 — 2026-08-07

## 결과 요약

| 검증 | 결과 |
|---|---|
| JavaScript 구문 검사 | 통과 |
| 단위 테스트 | 36/36 통과 / 실패·skip 0건 |
| Docker 통합 테스트 | 8/8 통과 / 실패·skip 0건 |
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
$env:INTEGRATION_DATABASE_URL='<테스트 환경에서 안전하게 주입>'
$env:INTEGRATION_BASE_URL='http://localhost:3000'
npm.cmd run test:integration
docker compose -f compose.yaml -f compose.test.yaml ps
```

아래 Phase별 본문 수치는 각 Phase 실행 당시의 역사적 결과다. 현재 최종 판정은 문서 하단의 `기업형 확장 최종 검증`과 `develop docs/14_전역지침_1대1_보완체크리스트.md`를 기준으로 한다.

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

## Phase 11 배포 검증

- 약한 값과 누락 값은 사전검사에서 배포 전에 차단됨
- 강한 임시값으로 운영 Compose 렌더링 통과
- 배포 스모크 4/4 통과: frontend health, backend health, 익명 401, 공식 반전 로고
- 실행 중 frontend, backend, database 모두 healthy
- production 구성은 frontend 포트만 게시하고 로그 순환과 no-new-privileges 적용
- 프런트 health JSON 계약과 로고 실제 경로 불일치를 첫 실행에서 발견하고 검사기를 수정한 뒤 재검증

## Phase 12 유지보수 검증

- 읽기 전용 상태 점검: frontend/API 200, 필수 테이블 5/5
- PostgreSQL custom-format 백업: 108,129 bytes 및 SHA-256 기록
- 격리 복구: users 2, items 8, loans 0, audit_logs 29, 필수 테이블 5개 일치
- 복구 훈련용 고유 임시 DB 제거 완료, 운영 DB 무변경
- 운영 의존성 audit: 알려진 취약점 0건
- 로컬 검증 백업은 `artifacts/backups`에 보관하고 Git에서 제외

## 개선 루프

초기 `frontend` healthcheck가 Nginx 안에서 `localhost` 해석 문제로 실패했으나 외부 화면과 API는 정상이었다. 헬스 대상 주소를 `127.0.0.1`로 명시하고 프론트엔드를 재빌드해 세 컨테이너 모두 `healthy`가 됨을 재검증했다.

## 판정

프론트엔드·백엔드·데이터베이스를 분리한 로컬 3계층 배포와 핵심 기능 검증이 완료됐다. 운영 배포 전에는 기본 비밀 변경, HTTPS, 백업·복구 훈련이 필요하다.

## 2026-08-07 최우선 보완 재검증

| 경계 | 결과 | 증거 |
|---|---|---|
| 단위 품질 게이트 | 통과 | 23/23, 실패·skip 0 |
| Docker 통합 게이트 | 통과 | 3/3, 실패·skip 0; 환경 누락 시 exit 2 |
| UI→API | 통과 | 로그인, 대시보드, 비품, 대여·반납, 감사 화면 |
| API→DB | 통과 | 등록·대여·반납·수정·비활성화 트랜잭션 |
| 오류 계약 | 통과 | code/message/fieldErrors/requestId 및 x-request-id |
| 감사 추적 | 통과 | 업무 이벤트 request_id·ip_address 저장·표시 |
| DB 변경 | 통과 | 001·002 migration 및 SHA-256 이력 |
| 관측 | 통과 | 비밀 제외 구조화 HTTP·오류·서버·DB 로그 |
| 로그인 방어 | 통과 | 계정 잠금 + IP/이메일 429·Retry-After |
| 브라우저 | 통과 | 4개 핵심 화면 의미 있는 본문, 오류 overlay·console 오류 0 |
| 정적 배포 갱신 | 통과 | HTML no-store, CSS/JS 버전 키, 최신 감사 추적 열 표시 |
| Docker | 통과 | frontend/backend/database 모두 healthy |
| 유지보수 점검 | 통과 | frontend/API 200, 필수 테이블 6/6 |

최신 상세 판정은 `develop docs/14_전역지침_1대1_보완체크리스트.md`와 `docs/phase-reports/13_최우선_보완.md`를 따른다.

## 2026-08-07 기업형 확장 최종 검증

| 검증 | 결과 |
|---|---|
| JavaScript 구문 | 27개 통과 |
| 단위 테스트 | 27/27 통과, 실패·skip 0 |
| Docker 통합 | 5/5 통과, 실패·skip 0 |
| 기업 승인 원자성 | 배정·상태·감사·Outbox 일괄 반영 통과 |
| 3계층 상태 | frontend/backend/database 모두 healthy |
| 실제 SPA | 로그인 + 업무 10페이지, 기업 메뉴 9개 순회 통과 |
| 브라우저 | 콘텐츠 있음, 오류 overlay 0, console 경고·오류 0 |
| 유지보수 | 필수 테이블 28/28 |
| 백업 | `seowon-inventory-20260807T000223Z.dump`, 191,832 bytes, SHA-256 `9f3ad0f3999c7c5a033986f815ba4fd9806c3aef612b06e82278669992124044` |
| 격리 복구 | 28/28 테이블, 3/3 migration, 주요 데이터 수 일치 |

상세 변경 및 실패 개선 루프는 `docs/phase-reports/14_기업형_확장_보완.md`, FR별 판정은 `develop docs/15_기업형_FR_구현대조표.md`를 따른다.

## Phase 15 증적·추적성 동기화

- GitHub Issue #2로 작업 정의를 생성하고 PR #1의 자동 종료 대상으로 연결한다.
- 최신 요약 수치를 단위 27/27, 통합 5/5, Docker 3/3 healthy로 통일한다.
- 과거 Phase 실행 수치는 삭제하지 않고 역사적 결과임을 명시한다.
- 실제 운영 배포와 실환경 사용자 인수는 수행하지 않았으므로 Phase 11·12를 부분 완료로 판정한다.

## Phase 16 FR-025 구매 요청 검증

| 검증 | 결과 |
|---|---|
| 구매 payload 단위 | 정상 정규화·누락·수량·금액·비용센터·실제 날짜 검증 통과 |
| HTTP 통합 | 정상 저장·감사, 필수값 400, 다른 조직 403, 잔존 요청 0 |
| 전체 단위/통합 | 30/30, 6/6, 실패·skip 0 |
| Docker | frontend/backend/database 모두 healthy |
| 정적 SPA | 최신 app.js 200, 구매 폼·품목·비용센터·필요일 필드 확인 |
| 로그 | 검증 구간의 예상하지 않은 500 오류 0 |
| 자동 브라우저 | 브라우저 도구 커널 자산 경로 오류로 미실행; 인수 대기 |

FR-025는 자동 브라우저에서 직원 로그인 → 요청함 → 구매 초안 생성 → 구매 요약 표시를 확인한 뒤 완료로 판정한다.

## Phase 17 FR-026/027 부분 입고·검수 검증

| 검증 | 결과 |
|---|---|
| 발주 입력 단위 | 발주번호·금액 정규화 및 오류 거부 통과 |
| 검수 입력 단위 | PASS/FAIL/CONDITIONAL 정규화, 그 외 거부 통과 |
| 전체 단위/통합 | 32/32, 7/7, 실패·skip 0 |
| 부분 입고 | 2/3 `PARTIAL_RECEIVED`, 잔여 입고 후 `RECEIVED` |
| 역조건 | 누적수량 초과 409, 검수 전 자산 0, 중복 검수 409 |
| 자산화 | PASS 2개 AVAILABLE 자산·이력·연결 생성, FAIL 추가 자산 0 |
| PostgreSQL | 필수 테이블 29/29, migration 4/4 |
| Docker | frontend/backend/database 모두 healthy |
| 백업·격리 복구 | 304,042 bytes, SHA-256 `2520f1f49f531af719f9b11fac95a44bf9b599e33897a3af49b55c704a532715`, 전후 건수 일치 |
| 브라우저 | Codex 런타임 `failed to write kernel assets` 외부 오류로 미실행; FR-025 인수와 함께 잔여 추적 |

## Phase 18 FR-033/035 다차원 보고·감사 검증

| 검증 | 결과 |
|---|---|
| 필터 단위 | 차원 ID·상태·실제 날짜·기간 순서·감사 시각 검증 통과 |
| 전체 단위/통합 | 36/36, 8/8, 실패·skip 0 |
| 권한 역조건 | USER 보고서 403, 감사 ADMIN 제한 유지 |
| 다차원 집계 | 부서·위치·유형·상태·취득기간 필터와 건수·취득가 일치 |
| CSV | 화면과 동일 필터, 대상 자산 포함, text/csv 응답 |
| 다운로드 감사 | `REPORT_EXPORTED`에 필터·행 수·request ID·IP 기록 및 검색 통과 |
| 실제 SPA | 보고 필터·4개 차원표·감사 검색 폼 정적 번들 확인 |
| 브라우저 | 런타임 경로 오류가 반복되어 실제 클릭 인수는 Issue #3에 통합 유지 |
