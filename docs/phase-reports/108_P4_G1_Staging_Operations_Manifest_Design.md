# P4-G1 Staging Operations Manifest Design 결과

기준일: 2026-08-31

결과: **candidate 계약 PASS / provider 활성화 대기**

## 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| PITR 계약 | [x] | pitrEnabled·WAL Secret 필수 유지 |
| Free logical backup | [x] | retention·schedule·restore evidence 필수 |
| candidate manifest | [x] | 실제 hostname·Supabase·provider 계획 연결 |
| Secret 원문 | [x] 없음 | resource name만 기록 |
| candidate 구조 | [x] | `--allow-candidate` PASS |
| 배포 fail-closed | [x] | 기본 preflight는 candidate 거부 |
| OIDC·Storage | [ ] 외부 활성화 | client·bucket·policy 미생성 |
| provider HTTPS routes | [ ] 외부 활성화 | P3 loopback 증거만 존재 |
| event publisher | [ ] 외부 입력 | provider 미정 |
| DNS/TLS | [ ] 외부 활성화 | hostname 예약, 미게시 |

## 판정

기존 계약이 모든 환경에서 `pitrEnabled=true`를 강제해 Free plan의 검증된 logical backup을 표현하지 못하던 문제를 수정했다. Production의 PITR 역조건은 유지하며 staging logical mode에는 retention·schedule·restore evidence를 필수화했다.

candidate는 실제 확인된 hostname·Supabase·P3 provider 경로를 담지만 모든 미활성 provider를 `blocked-*`로 표시한다. `--allow-candidate`에서만 구조 검사가 통과하며 기본 preflight는 `activationState=active`가 아니므로 배포를 거부한다.

## 다음 READY

`P4-G1-STAGING-PROVIDER-ROUTES-AND-SECRET-REFERENCES`
