# ACC-P6-81 Production Cutover Child Resource Bounds

기준일: 2026-09-03

## 결과 / 상태

- [x] cutover child 기본 timeout 10분, 허용 최대 30분 적용
- [x] stdout·stderr 합산 기본 1MiB, 허용 최대 4MiB 적용
- [x] timeout·출력 초과·spawn 오류·signal 종료를 bounded 실패 상태로 정규화
- [x] 자원 실패 시 child 강제 종료와 `close` 동기화
- [x] 실패 receipt에서 stdout·stderr와 stale 역할 PASS summary 제거
- [ ] 실제 변경창 cutover·DNS/TLS·역할 UAT·서명

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 cutover child process 자원 경계만 강화 |
| 산출물 | PASS | bounded spawn과 실패 상태·receipt 역조건 |
| 검증 | PASS | focused 51 PASS·1 SKIP, 전체 851 PASS·8 SKIP |
| 보안 | PASS | stdout·stderr 합산 상한, 오류 원문·Secret receipt 미기록 |
| 추적성 | PASS | 구현 `fe219de`, GitHub quality `33650821145` |
| Git·Rollback | PASS | exact 구현 2파일, 기존 12 Gate·14 step 계약 보존 |
| 외부 Gate | WAIT | 승인 변경창·자격증명 reference·실제 역할/서명 필요 |

## 검증 증거

- failure-first → 출력 초과 미탐지, timeout 미탐지, 자원 실패보다 stdout PASS 상태 우선 등 3건 재현
- 최소 수정 → child마다 timeout과 stdout·stderr 합산 byte 상한을 강제하고 초과 시 종료
- 실패 정규화 → `FAIL_CUTOVER_CHILD_TIMEOUT`, `FAIL_CUTOVER_CHILD_OUTPUT_LIMIT`, `FAIL_CUTOVER_CHILD_SPAWN_ERROR`, `FAIL_CUTOVER_CHILD_SIGNAL`
- receipt 경계 → child 원문을 기록하지 않고 bounded 상태만 기록하며 실패 시 역할 PASS summary를 폐기
- Windows 종료 동기화 → kill 뒤 `close`를 기다리고 5초 bounded fallback을 적용
- focused 6개 파일 → 52 total·51 PASS·1 Windows SKIP·0 FAIL
- 구문 검사 → 414/414 PASS
- 단위시험 → 859 total·851 PASS·8 SKIP·0 FAIL
- `npm.cmd run harness:verify` → PASS
- GitHub-hosted quality run `33650821145` → completed successfully

## 미완료 / 외부 Gate

- 실제 child, DNS/TLS, 역할별 UAT, 서명과 P7 운영 활성화는 실행하지 않았다.
- 실제 cutover는 2026-09-11 20:00~23:00 KST 변경창과 기존 exact confirmation·자격증명 계약을 모두 요구한다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
