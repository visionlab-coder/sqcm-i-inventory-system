# ACC-P6-84 Production Cutover Receipt Rollback Cutoff

기준일: 2026-09-03

## 결과 / 상태

- [x] step·Gate receipt를 승인 시작부터 22:00 rollback cutoff까지만 허용
- [x] 역할별 실제 UAT 결과를 rollback cutoff까지만 허용
- [x] 업무·보안·운영 실제 서명을 rollback cutoff까지만 허용
- [x] 22:00 이후 증거가 `productionGo=true` 후보로 승격되는 경로 차단
- [ ] 실제 변경창 cutover·DNS/TLS·역할 UAT·서명

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | actual P6 evidence의 시간 경계만 강화 |
| 산출물 | PASS | receipt·역할 결과·서명 공통 rollback cutoff 검증 |
| 검증 | PASS | failure-first 2건, focused 33/33, 전체 858 PASS·8 SKIP |
| 보안 | PASS | cutoff 이후 문서가 정상 형식이어도 Production GO 차단 |
| 추적성 | PASS | 구현 `e6f6e37`, GitHub quality `33655224048` |
| Git·Rollback | PASS | exact 구현 2파일, 기존 변경창 시작 경계 보존 |
| 외부 Gate | WAIT | 승인 변경창·자격증명 reference·실제 역할/서명 필요 |

## 검증 증거

- failure-first → 22:00:00.001 이후 step/Gate receipt와 역할/UAT 서명이 actual 증거로 수용되는 2건 재현
- 최소 수정 → 공통 시간 판정을 `start <= checkedAt/signedAt <= rollbackCutoff`로 제한
- focused actual-evidence·signoff-resume·executor → 33/33 PASS
- 구문 검사 → 414/414 PASS
- 단위시험 → 866 total·858 PASS·8 SKIP·0 FAIL
- GitHub-hosted quality run `33655224048` → completed successfully

## 미완료 / 외부 Gate

- 실제 receipt, DNS/TLS, 역할별 UAT, 서명과 P7 운영 활성화는 실행하지 않았다.
- 실제 cutover는 2026-09-11 20:00~23:00 KST 변경창 안에서 실행하되 P6 GO 증거는 rollback cutoff 22:00까지 완료되어야 한다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
