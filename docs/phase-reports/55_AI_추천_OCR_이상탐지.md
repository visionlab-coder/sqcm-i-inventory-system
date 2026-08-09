# Phase 55 — AI 구매·이동 추천·OCR·이상탐지·자연어 검색

## 구현

- `019_ai_cost_recommendations.sql` 추가
  - 추천·OCR 추출·이상탐지 결과를 조직·모델 버전·근거와 함께 저장할 구조
- `src/services/ai-service.js`
  - 이동·수리·교체 후보를 비용 근거로 정렬
  - 자연어를 고정된 자산 검색 필터로만 변환
  - 수리비/취득가 이상 비율 이상탐지
  - OCR provider adapter 계약; 미설정 시 501, production은 503
- API: `/api/enterprise/ai/recommendations`, `/ai/search`, `/ai/anomalies`, `/ai/ocr`
- 추천은 자동 실행/구매를 하지 않고 `PROPOSED`·승인 게이트를 유지한다.

## 검증

- 자연어 주입 문자열이 SQL로 실행되지 않고 필터로만 정규화되는 단위 테스트 통과
- 타 조직 AI 접근 403 단위 테스트 통과
- 모든 응답에 provider/modelVersion/evidence/confidence 계약 확인
- 외부 LLM/OCR 없는 로컬 환경에서도 fail-closed

## 남은 위험

실제 모델·OCR 공급자, embedding/vector 검색, 평가 데이터셋, 모델 drift/PII 정책은 외부 공급자·보안 승인 후 추가해야 한다. 현재 구현은 설명 가능한 규칙 기반 의사결정 보조다.

## 판정

**완료(운영 AI 공급자 승인 전).**
