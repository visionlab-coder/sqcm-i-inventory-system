# P6 Cutover Run Provenance 및 Actual Evidence Assembler

기준일: 2026-09-01

## 결과

`ACC-P6-13-CUTOVER-RUN-PROVENANCE-AND-ACTUAL-EVIDENCE-ASSEMBLER`의 로컬 준비를 완료했다. 실제 변경창 증거가 없으므로 actual 문서 생성은 `NOT_RUN`, `productionGo=false`다.

## 7범주 체크리스트

- [x] 목표·범위: 실행 receipt에서 최종 P6 actual 문서까지의 자동 증거 경로
- [x] 산출물: runId receipt, assembler, 역할·서명 입력 계약, 단위 회귀
- [x] 검증: 12 Gate·14 step·3 역할·3 서명 합성 정상 흐름 PASS
- [x] 보안: Secret·stdout·stderr 미포함, identity reference만 허용
- [x] 추적성: receipt 파일명·SHA-256·동일 runId·변경창 시각 강제
- [x] 파일 안전: 물리 입력, 저장소 밖 출력, `wx` 비덮어쓰기
- [-] 실제 외부 Gate: DNS/TLS·MFA·역할 결과·서명·actual assembly는 변경창 전 `NOT_RUN`

## 검증 증거

- `npm.cmd run production:cutover-actual-evidence`: `READY_WAIT_ACTUAL_CUTOVER_EVIDENCE_INPUTS`, 변경 0
- focused actual assembler: 5/5 PASS
- `npm.cmd run production:cutover-process-runner-rehearsal`: receipt 26, run identity 1/1 PASS
- `npm.cmd run check`: 구문 237개, 단위 345 PASS·0 FAIL·Windows symlink 1 SKIP

## 다음 Gate

- 공식 READY: `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`
- 실제 실행 후 `PRODUCTION_CUTOVER_RUN_ID`, 역할 결과 3건, identity 서명 3건과 저장소 밖 출력 경로를 연결해 assembler를 실행한다.
