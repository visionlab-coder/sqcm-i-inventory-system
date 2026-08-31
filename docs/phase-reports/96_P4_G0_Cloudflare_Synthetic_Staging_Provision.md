# P4-G0 Cloudflare·격리 Staging 사전환경 구축

기준일: 2026-08-29 08:55 KST
상태: **PARTIAL TARGET PROVISIONED / PROVIDER INPUT REMAINS**
로드맵: **4 / 8**, P4-G0 유지

## 결과

문서 HOLD에서 실제 인프라 준비 단계로 진행했다. 기존 `sqcm-i` tunnel과 완전히 분리된 `sqcm-i-inventory-staging` tunnel을 Cloudflare 계정에 생성했고, `inventory-staging.safe-link.co.kr → 127.0.0.1:3100` ingress config를 D:에 준비했다. 미완성 인증 환경을 공개하지 않기 위해 DNS는 아직 생성하지 않았다.

별도 Docker project `seowon-inventory-staging-synthetic`을 만들고 frontend/backend/database 정확히 3서비스를 기동했다. 외부 게시 포트는 `127.0.0.1:3100` 하나뿐이며 기존 local project와 DB/file volume을 공유하지 않는다.

## 완료 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| 전용 hostname | [x] 선택 | `inventory-staging.safe-link.co.kr`, DNS 미게시 |
| 독립 Cloudflare tunnel | [x] 완료 | ID `994b5a27-cba4-4958-aecf-ed43db8730ef`, connector 시험 PASS |
| 기존 SQCM-i tunnel 보존 | [x] 완료 | 기존 `sqcm-i` 연결 4개 유지 |
| credential 최소 ACL | [x] 완료 | 현재 사용자·SYSTEM만 Full Control |
| D: runtime config | [x] 완료 | `D:\seowon_runtime\sqcm-i-inventory-staging\cloudflared.yml`, ingress validate PASS |
| 격리 Docker 3서비스 | [x] 완료 | backend/database/frontend 3/3 healthy |
| loopback 공개 제한 | [x] 완료 | `127.0.0.1:3100`만 게시 |
| health/readiness/smoke | [x] 완료 | 200/200, smoke 5/5, 미인증 items 401 |
| 실제 오류 로그 | [x] 완료 | 서비스별 수정 검사 0건 |
| 회사 OIDC | [ ] 후보 복원 중 | 기존 Supabase free project가 OIDC provider 기능을 지원하지만 provenance/client/서명키/동의 UI 미검증 |
| 외부 객체 저장소 | [ ] 후보 복원 중 | 같은 Supabase project의 S3-compatible Storage 후보 발견, bucket/RLS/credential 미설정 |
| event publisher | [!] 차단 | endpoint/account/receipt 없음 |
| PITR/WAL archive | [!] 차단 | archive provider·정책·복구시점 증거 없음 |
| 공급자 Secret reference | [!] 부분 | 내부 runtime Secret은 보호됨. 외부 공급자 reference 없음 |

P4-G0 필수 체크: `9 / 14` 준비, `2 / 14` 후보 복원 중, `3 / 14` 외부 입력·비용 차단.

## 통합 사전검토

| 구분 | 판정 |
|---|---|
| 공급자·배포처 | Cloudflare, Inc. / `safe-link.co.kr` 계정 경계 확인 |
| 정확한 구성 | 서명 유효 `cloudflared 2026.7.1`, SHA-256 기록. `2026.8.2` 업데이트 권고가 있으나 기존 운영 tunnel 보호를 위해 업데이트하지 않음 |
| 읽는 데이터 | 새 tunnel credential, staging ingress config, loopback HTTP origin |
| 생성·변경 | 새 tunnel 1개만 생성. DNS·OAuth·R2·Access·Production은 변경하지 않음 |
| 계정·환경 | 기존 Cloudflare 계정의 staging 전용 tunnel |
| 최소 권한 | 기존 tunnel 수정 없이 별도 credential, 사용자·SYSTEM ACL |
| 시험·철회 | connector 연결 확인 후 우리가 시작한 PID만 종료. tunnel 단위 삭제로 철회 가능 |
| 로그·감사 | tunnel list, connector 상태, D: runtime log 경로 확보 |

판정: **ALLOW_WITH_CONDITIONS**. OIDC·storage·event·PITR가 준비되기 전 public DNS와 상시 connector를 열지 않는다.

## 검증 결과

- Compose 서비스/포트 계약: PASS, 3서비스, `127.0.0.1:3100` 하나
- Docker health: 3/3 PASS
- deploy smoke: 5/5 PASS
- backend readiness: HTTP 200
- 인증 역조건: `/api/items` HTTP 401
- 로그: 실제 FATAL/ERROR/5xx signature 0건
- 기존 inventory stack: 3/3 healthy
- 보호 listener: 1234/6632, 11434/8588, 18765/22716, 18766/65400, 18767/28532 보존
- Secret 원문 출력·Git 추적: 0건

초기 로그 검사에서 PostgreSQL 타임스탬프와 `5432`가 일반 `5xx` 정규식에 8건 오탐됐다. 서비스별 패턴으로 교정한 결과 실제 오류는 0건이었다.

## 현재 구성

```text
Cloudflare account
  ├─ sqcm-i tunnel → 기존 SQCM-i OS:8787 (변경 없음)
  └─ sqcm-i-inventory-staging tunnel (생성, DNS/상시 실행 보류)
       └─ planned hostname → 127.0.0.1:3100
            └─ synthetic Docker project
                 ├─ frontend
                 ├─ backend → 기존 AI/Defender bridge
                 └─ database (격리 volume)
```

## Supabase 기존 자산 발견

연결된 Supabase 계정에서 무료 조직 `visionlab-safe-link`와 비활성 프로젝트 `wzmzpuxpcpuvuacwmslj` 하나를 발견했다. 새 과금 프로젝트를 만들지 않고 기존 프로젝트 복원을 요청했으며, 세 번의 상태 확인에서 계속 `COMING_UP`이어서 같은 Loop의 자동 재시도를 중단했다.

- 데이터·schema·migration 변경: 실행하지 않음
- 현재 용도: 아직 미확정. 활성화 후 table/schema·advisor를 읽어 inventory 전용 여부를 먼저 판정
- PostgreSQL: 17.6.1, Tokyo `ap-northeast-1` 후보
- Storage: 공식 S3-compatible endpoint 제공 가능
- OIDC: Supabase OAuth 2.1 Server가 OIDC provider 역할을 지원하지만 현재 beta이며 asymmetric signing key, authorization UI, confidential client 설정이 추가로 필요
- PITR: Free plan 포함 기능이 아니라 유료 add-on이므로 비용 승인 전 활성화 금지

따라서 Supabase는 **PostgreSQL·Storage·OIDC 통합 후보**로만 올렸고 아직 실제 P4 provider PASS로 처리하지 않았다.

## 남은 READY

다음 작업은 `P4-G0-SUPABASE-RESTORE-AUDIT-THEN-PROVIDER-SECRET-REFERENCES`다. Supabase가 ACTIVE가 되면 schema·table·advisor를 읽기 감사하고, 다른 업무 데이터가 없을 때만 inventory staging의 PostgreSQL·Storage·OIDC 후보로 확정한다. 이후 event publisher, PITR 비용, provider credential reference를 닫기 전에는 public DNS를 게시하거나 실제 P4 staging으로 승격하지 않는다.

진행도: `████░░░░ 4 / 8`
P4-G0 내부 준비도: `█████████░░░░░ 9 / 14`
