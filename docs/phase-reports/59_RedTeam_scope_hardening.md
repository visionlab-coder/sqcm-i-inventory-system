# RedTeam 후속 Scope Hardening 보고서

## 발견 및 수정

1. 부서 범위 Cost 조회의 repair/transfer/disposal 이벤트와 월별 이벤트 집계가 조직 전체 비용을 포함할 수 있던 문제를 자산 부서 조건으로 제한했다.
2. 부서 범위 관리자에게 조직 예산을 노출하지 않도록 Cost Command Center 응답에서 예산을 숨겼다.
3. 알림 조회에 조직·수신자·자산/요청 부서 범위를 적용했다.
4. OCR 요청에서 자산·파일이 현재 조직의 활성 리소스인지, 자산-파일 연결이 일치하는지, 부서 범위가 허용되는지 검증하도록 했다.
5. AI 추천·자연어 검색·이상탐지의 비용/위치 조인에도 조직 일치 조건을 추가했다.

## 검증

- `npm.cmd run check`: syntax 77, unit 92/92 PASS
- `npm.cmd run ui:contract`: 8/8 PASS
- `test/integration/ai-cost-control.test.js`: 2/2 PASS
- Full Docker integration: 19/19 PASS
- Department-scoped Cost query: PASS
- OCR provider-not-configured and input-boundary smoke: PASS

## 판정

이번 레드팀 후속 결함은 수정 완료했다. 실제 운영 PostgreSQL 백업/PITR, 외부 공급자, 역할별 UAT 서명, DNS/TLS 및 landing Cost 섹션 연결은 여전히 외부 승인 게이트이므로 Production은 **NO-GO**다.
