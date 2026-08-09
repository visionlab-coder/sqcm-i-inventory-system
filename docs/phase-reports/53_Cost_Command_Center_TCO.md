# Phase 53 — Cost Command Center와 TCO 데이터 모델

## 구현

- `017_cost_control_tco.sql` 추가
  - `asset_financial_profiles`: 내용연수·잔존가·감가·보증·리스
  - `asset_cost_events`: 취득·수리·이동·처분·리스 비용 이벤트
  - `cost_budgets`: 조직·Cost Center·회계연도 예산
- 기존 취득가·수리 티켓과 비용 이벤트를 조직 단위로 합산한다.
- `/api/enterprise/cost/command-center` 추가
  - TCO, 장부가, 감가, 유휴 자본, 유휴일, 보증/리스 만료, 예산 반환
- UI에 구매 전 의사결정 화면과 유휴 자산 이동 후보를 추가했다.

## 검증

- migration 017 Docker 적용
- 단위·통합 테스트 전체 통과
- 조직·부서 scope가 Cost SQL에 적용됨
- 근거가 없는 비용은 0으로 추정하지 않고 원장 누계로만 표시

## 남은 위험

예산 실적/회계 ERP 연계, 다통화, 세금, 복합 감가법은 외부 회계 데이터 계약이 필요하다.

## 판정

**완료(회계 시스템 연계 전제).**
