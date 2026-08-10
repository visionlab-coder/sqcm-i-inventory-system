# Phase 63 — Cost ROI·공급사 성과·절감액 원장 보고서

## 완료 범위

- `cost_savings_events` 원장을 추가해 기준 비용·실제 비용·회피액·근거를 기록한다.
- Cost ROI API가 실현 절감액, 기준/실제 비용, 예산 대비 사용액과 잔액을 반환한다.
- 공급사별 발주액, 주문 수, 평균 납기, 수리 건수·수리비를 기존 구매·수리 원장에서 집계한다.
- 부서 범위 사용자는 허용 부서 자산에 연결된 비용만 조회한다.
- Cost Command Center에 절감 KPI·예산·공급사 지표와 실적 기록 폼을 추가했다.

## 검증

| 항목 | 결과 |
|---|---:|
| JavaScript syntax | 81 files PASS |
| Unit tests | 97/97 PASS |
| UI contract | 13/13 PASS |
| Docker integration | 20/20 PASS |
| Database migrations | 22/22 일치 |

## 남은 제한

절감액은 제품 원장 기준이며 회계 ERP·구매 계약과의 외부 reconciliation은 아직 운영 게이트다.
