# SQCM-i 서원토건 비품관리 시스템

서원토건 임직원이 비품의 입고, 재고, 대여, 반납과 감사 이력을 한곳에서 관리하는 교육용 웹 애플리케이션입니다.

## 핵심 범위

- 세션 기반 로그인과 `ADMIN`/`MANAGER`/`USER` 권한
- 비품 등록·수정·검색, 재고 부족 표시
- 비품 대여·반납과 연체 상태
- 대시보드 지표와 감사 로그
- PostgreSQL 영속화, Docker Compose 실행

## 빠른 실행

```bash
copy .env.example .env
docker compose up --build
```

브라우저에서 `http://localhost:3000` 접속 후 개발 시드 계정으로 로그인합니다.

- 관리자: `admin@seowon.local` / `Admin1234!`
- 담당자: `manager@seowon.local` / `Manager1234!`

> 시드 암호는 로컬 실습 전용입니다. 운영 환경에서는 `SEED_ADMIN_PASSWORD`, `SEED_MANAGER_PASSWORD`를 반드시 변경합니다.

## 문서

- 고객 문서: [`client docs`](./client%20docs)
- 개발 문서: [`develop docs`](./develop%20docs)
- 에이전트 문서: [`agent docs`](./agent%20docs)
- 단계별 보고서: [`docs/phase-reports`](./docs/phase-reports)
- 화면 목업: [`mock/html/index.html`](./mock/html/index.html)

## 상태

1~10단계와 Docker 로컬 배포 검증을 완료했습니다. 11단계의 외부 배포와 GitHub 협업자 초대는 정확한 GitHub 사용자명이 확인되면 수행합니다. 상세 결과는 [`docs/verification-report.md`](./docs/verification-report.md)를 확인하세요.
