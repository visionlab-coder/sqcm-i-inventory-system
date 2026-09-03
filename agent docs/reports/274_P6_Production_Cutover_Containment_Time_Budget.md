# ACC-P6-83 Production Cutover Containment Time Budget

기준일: 2026-09-03

## 결과 / 상태

- [x] 2분 rollback reserve를 route-disable·orphan recovery·종료 유예·orchestration 여유로 분할
- [x] route-disable와 ingress orphan recovery timeout을 각각 최대 50초로 제한
- [x] 상위 기본 timeout 10분 또는 호출자 확장값이 containment 예산을 확대하지 못하게 제한
- [x] containment을 보장할 수 없는 작은 reserve를 runner 생성 전에 거부
- [ ] 실제 변경창 cutover·DNS/TLS·역할 UAT·서명

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 cutover containment child 시간 예산만 강화 |
| 산출물 | PASS | 50초×2 child, 5초×2 종료 유예, 10초 orchestration 여유 |
| 검증 | PASS | failure-first 2건, focused 31 PASS·1 SKIP, 전체 856 PASS·8 SKIP |
| 보안 | PASS | Secret·stdout·stderr 계약 변경 없음, 작은 reserve fail-closed |
| 추적성 | PASS | 구현 `294bd8b`, GitHub quality `33653761361` |
| Git·Rollback | PASS | exact 구현 2파일, route-disable·orphan recovery 실행권 보존 |
| 외부 Gate | WAIT | 승인 변경창·자격증명 reference·실제 역할/서명 필요 |

## 검증 증거

- failure-first → containment 2개 child가 각각 상위 timeout 10분을 그대로 사용하고 작은 reserve가 수용되는 2건 재현
- 기본 reserve 120,000ms → child 50,000ms×2 + 종료 유예 5,000ms×2 + orchestration 여유 10,000ms
- 상위 timeout이 600,000ms여도 containment child는 각각 50,000ms로 제한
- focused 2개 파일 → 32 total·31 PASS·1 Windows SKIP·0 FAIL
- 구문 검사 → 414/414 PASS
- 단위시험 → 864 total·856 PASS·8 SKIP·0 FAIL
- `npm.cmd run production:cutover-preflight` → `READY_WAIT_CHANGE_WINDOW`, local blocker 0
- GitHub-hosted quality run `33653761361` → completed successfully

## 미완료 / 외부 Gate

- 실제 child, DNS/TLS, 역할별 UAT, 서명과 P7 운영 활성화는 실행하지 않았다.
- 실제 cutover는 2026-09-11 20:00~23:00 KST 변경창과 기존 exact confirmation·자격증명 계약을 모두 요구한다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
