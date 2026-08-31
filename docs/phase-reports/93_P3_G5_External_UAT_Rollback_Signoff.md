# P3 G5 External UAT Rollback and Signoff

기준일: 2026-08-25

상태: **PARTIAL PASS — 17/19 PASS, 외부 공급자 입력 HOLD**

## 체크리스트 시각화

- 진행률: `17 / 19` (89.5%)
- PASS: 17
- FAIL: 0
- NOT_RUN: 2
- 업무·보안·운영 승인: `3 / 3` (P3 G5 범위)
- 열린 Critical/High 결함: 0

## 이번 Loop 결과

| 항목 | 결과 | 증거 |
|---|---|---|
| backend rollback | PASS | 후보 `sha256:b9f0b76d...`에서 이전 `sha256:4dda021e...`로 backend만 전환 |
| rollback 검증 | PASS | health/readiness, deploy smoke 5/5, 역할 UAT 1/1, migration 22/22 |
| 정방향 복구 | PASS | 후보 digest 복구, deploy smoke 5/5, 역할·AI 3/3 |
| 서비스 보존 | PASS | frontend `49813e06cf13`, database `c30c3b7594dd` 불변 |
| 책임자 승인 | PASS | `PROJECT_OWNER_CURRENT_USER`가 업무·보안·운영 3건을 P3 G5 범위로 승인 |
| 실제 malware scanner | HOLD | 현재 `MALWARE_SCAN_DRIVER=mock`; provider·endpoint·시험 자격증명 reference 없음 |
| 실제 alert 수신 | HOLD | provider·channel·recipient·시험 자격증명 reference 없음 |

## 승인 경계

이번 승인은 P3 G5의 업무·보안·운영 UAT 승인에만 유효하다. P4 staging, P6 production, Secret 생성, 운영 migration, 외부 계정 연결을 승인하지 않는다.

## 다음 READY

`P3-G5-EXTERNAL-PROVIDER-INPUT`

다음 입력이 모두 있어야 재개한다.

1. malware scanner provider와 정확한 endpoint
2. 안전한 시험 credential reference와 허용 fixture
3. alert provider·channel·recipient
4. alert 시험 credential reference와 수신 확인 책임자

입력이 없으면 자동 재시도하거나 P4로 이동하지 않는다.
