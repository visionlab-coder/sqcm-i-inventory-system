# ACC-P6-82 Production Cutover Rollback Deadline Budget

기준일: 2026-09-03

## 결과 / 상태

- [x] 정상 cutover child timeout을 rollback cutoff의 남은 예산으로 축소
- [x] cutoff 전 2분을 route-disable·orphan containment reserve로 고정
- [x] reserve 소진 시 정상 child를 spawn하지 않고 bounded 실패 receipt 기록
- [x] route-disable·ingress orphan recovery는 deadline 소진 뒤에도 bounded 실행
- [x] 최초 실행과 signoff resume가 같은 rollback deadline·clock을 runner에 전달
- [ ] 실제 변경창 cutover·DNS/TLS·역할 UAT·서명

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 cutover child의 rollback deadline budget만 강화 |
| 산출물 | PASS | 정상 step 동적 timeout·2분 containment reserve·resume 연결 |
| 검증 | PASS | focused 30 PASS·1 SKIP, 전체 855 PASS·8 SKIP |
| 보안 | PASS | deadline 소진 시 Secret·child 실행 없이 bounded failure receipt |
| 추적성 | PASS | 구현 `fe50c85`, GitHub quality `33652418703` |
| Git·Rollback | PASS | exact 구현 4파일, route-disable·orphan recovery 실행권 보존 |
| 외부 Gate | WAIT | 승인 변경창·자격증명 reference·실제 역할/서명 필요 |

## 검증 증거

- failure-first → 남은 예산 미반영, reserve 소진 뒤 정상 child spawn, invalid deadline 수용 등 3건 재현
- 최소 수정 → `min(기본 timeout, rollback cutoff - 현재시각 - 2분)`으로 정상 step timeout 결정
- 예산 소진 → `FAIL_CUTOVER_CHILD_ROLLBACK_DEADLINE_EXHAUSTED` receipt를 남기고 child 0건
- containment 예외 → `route_disable`과 `ingress_orphan_recovery`는 기존 bounded timeout으로 계속 실행
- executor 연결 → 최초 cutover와 signoff resume 모두 같은 cutoff·clock을 process runner에 전달
- focused 2개 파일 → 31 total·30 PASS·1 Windows SKIP·0 FAIL
- 구문 검사 → 414/414 PASS
- 단위시험 → 863 total·855 PASS·8 SKIP·0 FAIL
- `npm.cmd run harness:verify` → PASS
- GitHub-hosted quality run `33652418703` → completed successfully

## 미완료 / 외부 Gate

- 실제 child, DNS/TLS, 역할별 UAT, 서명과 P7 운영 활성화는 실행하지 않았다.
- 실제 cutover는 2026-09-11 20:00~23:00 KST 변경창과 기존 exact confirmation·자격증명 계약을 모두 요구한다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
