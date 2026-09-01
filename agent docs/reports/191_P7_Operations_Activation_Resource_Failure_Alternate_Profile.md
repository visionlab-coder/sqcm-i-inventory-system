# ACC-P7-41 Operations Activation Resource Failure Alternate Profile

기준일: 2026-09-02

## 결과 / 상태

- [x] 동일 timeout 연속 2회 뒤 세 번째 시도에만 4시간 상한 적용
- [x] 동일 output-limit 연속 2회 뒤 세 번째 시도에만 4MiB 상한 적용
- [x] 혼합 실패·1회 실패·spawn·signal은 표준 프로필 유지
- [x] 실제 사용 프로필을 redacted 물리 receipt에 기록
- [x] 이전 receipt 실패 체인으로 기대 프로필 재계산·변조 거부
- [x] 세 번째 실패 뒤 기존 PAUSED 정책 보존
- [ ] 실제 P7 Production resource failure 및 대체 실행

공식 Phase는 P6 6/8, `productionGo=false`, P7 미착수다. 이 Packet은 Harness의 `alternateAfterFailureCount=2`를 resource failure에 한정해 실행 가능한 계약으로 연결한다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | 동일 resource 실패 대체 프로필만 보완 |
| 산출물 | PASS | 표준·확장 timeout·확장 output 프로필 |
| 검증 | PASS | failure-first 3건, focused 31/31 |
| 보안 | PASS | 환경 allowlist 불변, Secret·오류 원문 미기록 |
| 추적성 | PASS | receipt 자체 profile과 이전 실패 체인 교차검증 |
| Git·Rollback | PASS | 승인 전 bundle digest 재계산, 기존 3회 PAUSED 보존 |
| 외부 Gate | WAIT | 실제 P6/P7 Production 실행 NOT_RUN |

## 검증 증거

- failure-first → profile resolver 2건 미구현, selection failure metadata 1건 미구현으로 3/3 EXPECTED FAIL
- 동일 timeout 2개 물리 FAIL receipt → attempt 3 `EXTENDED_TIMEOUT`, PASS 뒤 다음 단계 전진
- 동일 output-limit 2개 물리 FAIL receipt → attempt 3 `EXTENDED_OUTPUT_LIMIT`, PASS 뒤 다음 단계 전진
- attempt 3 profile을 STANDARD로 변조 → `OPERATIONS_ACTIVATION_RECEIPT_INVALID`
- 혼합·1회·spawn failure → `STANDARD`, 확대 0건
- focused orchestrator·process runner·termination tests → 31/31 PASS
- `npm.cmd run operations:activation-process-runner-rehearsal` → 물리 문서 36개, alternate 2/2, 임시 산출물 0
- `npm.cmd run check` → syntax 309/309, unit 489 PASS·1 Windows symlink SKIP·0 FAIL
- activation bundle → 44 physical files, SHA-256 `f4b615ff493f0768dc520a46e02bb62026e85997c69065ecc100a8b29a688c1a`

## 미완료 / 외부 Gate

실제 Production child 실행과 resource failure는 발생시키지 않았다. 현재 P6 G4 actual·P7 활성화·Production GO·MFA 승인이 없으므로 오케스트레이터는 child/read/write 0 상태를 유지한다.
