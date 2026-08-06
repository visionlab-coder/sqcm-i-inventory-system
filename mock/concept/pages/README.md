# 페이지별 컨셉아트 세트

첨부 기준 문서의 11.3 주요 화면을 기준으로 **화면당 1개 파일**을 생성했다. 모든 이미지는 built-in `imagegen` 모드로 제작했으며 공통 디자인 시스템은 딥 네이비, 안전 오렌지, 웜 오프화이트, 좌측 탐색, 상단 검색, 상태별 텍스트+아이콘이다.

| # | 화면 | 파일 | 핵심 UX |
|---:|---|---|---|
| 01 | 로그인 | `01-login.png` | 사번/이메일, 일반화 오류, MFA, 재설정, 잠금 도움 |
| 02 | 대시보드 | `02-dashboard.png` | 승인·미배정·수리 지연·분실·실사 불일치 우선 |
| 03 | 자산 목록 | `03-asset-list.png` | 저장 필터, 부서/위치/유형/기간, 열 선택, CSV |
| 04 | 자산 상세 | `04-asset-detail.png` | 현재 담당/위치/상태, 전체 타임라인, 파일, 요청 |
| 05 | 자산 등록 | `05-asset-register.png` | 기본→구매→위치/배정→파일→검토 5단계 |
| 06 | 배정·반납 | `06-assignment-return.png` | 중복 배정 경고, 체크리스트, 사진, 반납 상태 분기 |
| 07 | 요청함 | `07-request-inbox.png` | 내 요청/승인 대기, 다단계 승인, 자기승인 차단 |
| 08 | 실사 | `08-stocktake.png` | QR/검색, 예상·실제 위치 비교, 불일치 사유·확정 |
| 09 | 수리 | `09-repair.png` | 증상·우선순위·담당·업체·완료일·비용 타임라인 |
| 10 | 보고서 | `10-reports.png` | 필터 우선, KPI·표·차트, 권한형 다운로드 이력 |
| 11 | 관리자 | `11-admin.png` | 조직·사용자·역할/범위·기준정보·감사 분리 |

브라우저형 갤러리는 `index.html`에서 확인한다.

## 공통 생성 프롬프트

```text
Use case: ui-mockup
Asset type: page-specific high-fidelity desktop web app concept art
Style: polished Korean enterprise asset-management SaaS, minimal Bento Grid and readable operational tables
Palette: deep navy, safety orange CTA, warm off-white, accessible status colors with text and icons
Layout: consistent left navigation, top search/notifications, page-specific content
Constraints: readable Korean labels, no people, no external logo, no watermark, desktop 1440px
```

## 페이지별 프롬프트 변수

- 로그인: split-screen, 일반화 오류, MFA·재설정·잠금 도움
- 대시보드: 승인/미배정/수리지연/분실/실사불일치 KPI와 처리 목록
- 자산 목록: 저장 필터, 열 선택, 페이지네이션, CSV 감사
- 자산 상세: 자산 헤더, 현재 책임정보, 탭, 파일, 생애주기 타임라인
- 자산 등록: 5단계 wizard, 중복 자산번호 오류, 임시저장, 검토 요약
- 배정·반납: 대상 확인, 인수인계 목록, 사진, 정상/수리/폐기 분기
- 요청함: 내 요청/승인 대기, 승인 단계, 자기승인 금지, 사유
- 실사: QR/검색, 예상/실제 위치, 불일치 사유, 담당·승인 확정
- 수리: 티켓 표, 우선순위·지연, 업체·비용, 진행 타임라인
- 보고서: 기간/부서/위치/유형/상태 필터, KPI, 차트, 다운로드 이력
- 관리자: 조직 트리, 사용자 표, 역할·데이터 범위 matrix, 재인증 경고
