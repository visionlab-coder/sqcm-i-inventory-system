# P4-G1 Staging Deployment Preflight 결과

기준일: 2026-08-31

결과: **부분 준비 / 외부 staging 입력 대기**

## 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| 실행계약 | [x] 증거 있는 완료 | strict 8/8, warning 0 |
| operations 계약 | [x] template 계약만 PASS | provider 6, Secret reference 9 |
| 실제 operations manifest | [ ] 외부 입력 | non-template 파일 없음 |
| 실제 배포 환경 참조 | [ ] 외부 입력 | synthetic local env만 존재 |
| Supabase project | [x] 증거 있는 완료 | ACTIVE_HEALTHY, PostgreSQL 17.6.1.166 |
| Supabase backup/PITR | [ ] 외부·비용 Gate | free plan, PITR 없음 |
| 현재 staging backup/restore | [ ] 외부 입력 | 현재 Supabase/staging backup·복구훈련 없음 |
| 로컬 backup/restore | [x] local-only | 2026-08-25 dump 복구 검증, migration 22 기준 |
| backend 불변 이미지 | [x] 증거 있는 완료 | GHCR digest 원격 조회 PASS |
| frontend 불변 이미지 | [x] 증거 있는 완료 | GHCR digest 원격 조회 PASS |
| 실제 cutover evidence | [ ] 외부 입력 | 12-gate template만 존재 |
| Harness autonomous verify | [ ] Not Available | external-input READY용 자동 verifier 미등록 |
| 보호 서비스 | [x] 보존 | 1234/6632, 11434/8588, 18765/22716 |

## 판정

전용 Supabase project `iuoljosldyymkburagwj`는 정상이며 application 23개·Supabase 24개 migration 기준선도 재검증됐다. P2에서 발행한 backend/frontend OCI index는 기록된 digest로 현재 GHCR에서 읽을 수 있다.

그러나 실제 배포를 승인하는 non-template operations manifest, 배포 환경 참조, Secret Manager resource reference와 cutover evidence가 없다. `.env.staging.local`은 loopback synthetic 시험용이며 외부 staging 자격증명이 아니다. 예시 production 환경은 placeholder Secret과 release tag를 배포 precheck가 정상적으로 거부했다.

조직 `sqcm-i-inventory`는 free plan이다. Supabase 공식 계약상 free project는 운영자가 논리 백업을 별도로 유지해야 하며 PITR는 Pro·Team·Enterprise plan의 유료 add-on과 최소 Small compute가 필요하다. 따라서 비용·보존기간·RPO/RTO 결정 없이 PITR를 활성화하거나 staging backup 완료로 표시하지 않았다.

## 필요한 외부 입력

- `inventory-staging.safe-link.co.kr`용 실제 operations manifest 승인본
- database/session/MFA/OIDC/storage/malware/event/alert/AI의 Secret **값이 아닌 resource reference**
- PITR 유료 사용 또는 논리 off-site backup 중 하나의 정책, retention·RPO/RTO·복구 책임자
- release SHA `79a12924106b378d2337898c76a4dd431634b78d`를 쓰는 staging 환경 참조
- 예약 hostname의 DNS/TLS·Cloudflare tunnel 활성화 범위
- backup→migration→deploy→rollback 변경 시간과 실행 책임자

## 다음 READY

`P4-G1-STAGING-RUNTIME-SECRETS-BACKUP-INPUT` — 위 입력이 실제 참조로 제공될 때까지 external-input Gate다.
