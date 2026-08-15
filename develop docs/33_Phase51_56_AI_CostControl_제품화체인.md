# Phase 51~56 AI 현장 자산 Cost Control 제품화 체인

## 제품 포지션

새로 구매하기 전에 다른 현장의 유휴 자산을 찾아 이동시키고, 구매·수리·교체 중 가장 비용이 낮은 행동을 추천하는 AI 현장 자산 Cost Control.

## 실행 원칙

1. 단일 자산 원장과 조직 범위가 AI보다 먼저다.
2. AI 추천은 근거·신뢰도·비용 비교·데이터 시점을 표시한다.
3. AI와 자동화는 사람 승인·멱등성·권한·감사 로그를 우회하지 않는다.
4. 실제 외부 AI 공급자·DNS·production 배포는 승인 전 실행하지 않는다.

| Phase | 목표 | 저장소 완료 조건 | 외부/인수 완료 조건 |
|---:|---|---|---|
| 51 | 이중 원장 제거·조직 격리 | `assets` 단일 원장, legacy API 제거/호환 차단, org scope 테스트 | 다조직 데이터 격리 UAT |
| 52 | 모바일 셸·정보구조·테이블 UX | 모바일 드로어, route/scroll, 역할별 navigation, responsive tests | 역할별 현장 UAT |
| 53 | Cost Command Center·TCO | TCO 스키마, idle/duplicate/repair/replace 지표, cost API/UI | 실제 비용·예산 데이터 검증 |
| 54 | 규칙 자동화·알림·SLA·worker | durable worker, rule/audit/idempotency, notification adapter | 외부 메일/메신저 전달 |
| 55 | AI 추천·OCR·이상탐지·자연어 | provider adapter, grounded recommendation, approval gate, mock evaluation | 승인된 AI provider·정확도 평가 |
| 56 | E2E·접근성·반응형·현장 UAT | 브라우저 자동검사·키보드·375/768/1440 검증 보고 | 실사용자 서명·production 승인 |

## 중단 조건

조직 격리 실패, 원장 불일치, AI 근거 누락, 자동화 중복 실행, Critical/High 결함이 발생하면 다음 Phase로 진행하지 않는다.
