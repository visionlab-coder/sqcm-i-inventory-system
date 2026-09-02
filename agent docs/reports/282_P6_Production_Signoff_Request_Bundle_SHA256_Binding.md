# ACC-P6-91 Production Signoff Request Bundle SHA-256 Binding

기준일: 2026-09-03

## 결과 / 상태

- [x] 실제 서명 3건에 검토한 물리 unsigned request bundle SHA-256 결박
- [x] actual assembler가 request bundle의 전체 계약·세 unsigned payload를 재검증
- [x] cutover resume와 standalone assembler에 동일 물리 bundle 참조 요구
- [x] 최종 actual P6 evidence에 request bundle SHA-256 보존
- [ ] 실제 변경창 cutover·DNS/TLS·역할 UAT·request bundle·서명

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | actual 서명과 사람이 검토한 물리 unsigned bundle의 직접 연결 |
| 산출물 | PASS | bundle SHA 계약·actual validator·CLI/resume 입력·회귀 테스트 |
| 검증 | PASS | failure-first 3건, focused 36/36 PASS, 전체 870 PASS·8 SKIP |
| 보안 | PASS | 변조 bundle·다른 bundle SHA·물리 bundle 참조 누락 차단 |
| 추적성 | PASS | 구현 `83bcf73`, GitHub quality `33665080041` |
| Git·Rollback | PASS | exact 구현 9파일, 기존 request-set/receipt/cutoff/containment 계약 보존 |
| 외부 Gate | WAIT | 승인 변경창·실제 역할 결과·bundle·책임자 identity 서명 필요 |

## 검증 증거

- failure-first → 변조 bundle 수용, 다른 bundle SHA 서명 수용, resume bundle 참조 누락 수용 3건 실패 재현
- 최소 수정 → 세 actual 서명에 `signoffRequestBundleSha256`을 요구하고 assembler가 물리 bundle의 전체 provenance와 세 unsigned payload를 다시 검증
- focused actual-evidence·request-bundle·cutover-executor → 36/36 PASS
- 구문 검사 → 417/417 PASS
- 단위시험 → 878 total·870 PASS·8 SKIP·0 FAIL
- Harness verify → 모든 검증 label exitCode 0
- GitHub-hosted quality run `33665080041` → unit·three-tier integration SUCCESS

## 미완료 / 외부 Gate

- 실제 request bundle·서명·receipt·DNS/TLS·역할별 UAT와 P7 운영 활성화는 실행하지 않았다.
- 실제 cutover는 2026-09-11 20:00~23:00 KST 변경창 안에서 실행하고 P6 GO 증거는 22:00 rollback cutoff까지 완료해야 한다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
