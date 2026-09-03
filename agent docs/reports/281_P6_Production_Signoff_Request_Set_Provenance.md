# ACC-P6-90 Production Signoff Request Set Provenance

기준일: 2026-09-03

## 결과 / 상태

- [x] unsigned request set의 deterministic SHA-256 식별자 고정
- [x] BUSINESS·SECURITY·OPERATIONS 실제 서명에 동일 request set ID 결박
- [x] request 준비 시각을 rollback Gate 이후·각 실제 서명 이전으로 제한
- [x] actual P6 assembler와 입력 계약에 fail-closed 검증 반영
- [ ] 실제 변경창 cutover·DNS/TLS·역할 UAT·서명

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | actual 서명이 검토한 unsigned request set을 직접 증명 |
| 산출물 | PASS | 공용 requestSetId 계산·actual validator·입력 계약·회귀 테스트 |
| 검증 | PASS | failure-first 3건, focused 48 PASS·1 Windows SKIP, 전체 869 PASS·8 SKIP |
| 보안 | PASS | 임의 request ID·혼합 preparedAt·서명 이후 생성된 요청 차단 |
| 추적성 | PASS | 구현 `da7bbb6`, GitHub quality `33663424611` |
| Git·Rollback | PASS | exact 구현 5파일, 기존 role/receipt/cutoff 계약 보존 |
| 외부 Gate | WAIT | 승인 변경창·실제 request bundle·책임자 identity 서명 필요 |

## 검증 증거

- failure-first → request set 필드 누락·변조·서명 이후 preparedAt 수용 3건 실패 재현
- 최소 수정 → request set ID를 run·release·core/rollback receipt·역할 결과 set·preparedAt의 canonical SHA-256으로 계산
- focused actual-evidence·request-bundle·resume·process-runner → 49 total·48 PASS·1 Windows SKIP
- 구문 검사 → 417/417 PASS
- 단위시험 → 877 total·869 PASS·8 SKIP·0 FAIL
- GitHub-hosted quality run `33663424611` → unit·three-tier integration SUCCESS

## 미완료 / 외부 Gate

- 실제 request bundle·서명·receipt·DNS/TLS·역할별 UAT와 P7 운영 활성화는 실행하지 않았다.
- 실제 cutover는 2026-09-11 20:00~23:00 KST 변경창 안에서 실행하고 P6 GO 증거는 22:00 rollback cutoff까지 완료해야 한다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
