# P4-G0 Supabase Provenance·Security 감사

기준일: 2026-08-29 15:17 KST
결과: **PASS AUDIT / EXISTING PROJECT REUSE REJECTED**
로드맵: **4 / 8**, P4-G0 진행 중

## 결과

복구된 Supabase 프로젝트는 `ACTIVE_HEALTHY`지만 SQCM-i 비품관리 전용 빈 프로젝트가 아니다. `sites`, `tbm_notices`, `nfc_workers`, `stop_work_alerts`, `claim13_*`, `tf_*` 등 41개 `public` table과 SAFE-LINK 인증·TBM·채팅·음성 migration 6개가 존재한다. 현재 row count가 0인 것은 소유권이나 용도가 비어 있다는 뜻이 아니므로 비품관리 schema를 이 프로젝트에 혼합하지 않는다.

판정은 **기존 SAFE-LINK 프로젝트 재사용 거부 / 비품관리 전용 Supabase 프로젝트 필요**다. SQL, migration, RLS, Auth, Storage 설정은 변경하지 않았다.

## 감사 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| 프로젝트 복구·상태 | [x] 완료 | `ACTIVE_HEALTHY`, Tokyo `ap-northeast-1` |
| PostgreSQL 확인 | [x] 완료 | `17.6.1.063` |
| schema provenance | [x] 완료 | `public` table 41개, SAFE-LINK/TBM/NFC/안전 업무 명칭 |
| migration provenance | [x] 완료 | 인증·TBM·채팅·음성·policy migration 6개 |
| security advisor | [x] 완료 | 30건: ERROR 3, WARN 21, INFO 6 |
| performance advisor | [x] 완료 | 174건: WARN 69, INFO 105, ERROR 0 |
| 외부 변경 없음 | [x] 완료 | SQL·migration·Auth·Storage·RLS 변경 0건 |

이번 READY: `7 / 7` 증거 있는 완료.

## 주요 보안 사실

- `public.tbm_notices`: policy가 있으나 RLS가 비활성화되어 있고 public exposed schema 경고가 함께 존재한다.
- `public.nfc_worker_identity_duplicates`: `SECURITY DEFINER` view 경고가 있다.
- mutable `search_path` 함수 6건, anon 실행 가능 `SECURITY DEFINER` 함수 7건, authenticated 실행 가능 함수 7건이 보고됐다.
- 이 경고는 SAFE-LINK 시스템 소유자 검토 대상이다. 비품관리 P4 작업에서 자동 수정하면 기존 업무 권한을 깨뜨릴 수 있으므로 변경하지 않았다.

참고: [RLS policy exists but disabled](https://supabase.com/docs/guides/database/database-linter?lint=0007_policy_exists_rls_disabled), [Security definer view](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view), [RLS disabled in public](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public)

## P4 전체 체크리스트

| 항목 | 상태 | 현재 판정 |
|---|---|---|
| 독립 Cloudflare tunnel·hostname | [x] 준비 | tunnel 생성, DNS 미게시 |
| 격리 Docker 3서비스 | [x] 준비 | 3/3 healthy, `127.0.0.1:3100` |
| 기존 Supabase 후보 감사 | [x] 완료 | SAFE-LINK 자산으로 판정, 재사용 거부 |
| 비품관리 전용 PostgreSQL·Storage·OIDC | [ ] 대기 | 전용 Supabase project 필요 |
| PITR·복구 정책 | [!] 차단 | 유료 add-on 비용·RPO/RTO 승인 필요 |
| event publisher | [!] 차단 | 승인된 endpoint·계정·receipt 없음 |
| 공급자 Secret reference | [!] 차단 | 전용 project 생성 전 확정 불가 |
| public DNS·실제 staging 배포 | [-] 승인된 보류 | 공급자 Gate 완료 전 공개 금지 |

진행률: `████░░░░ 4 / 8`

## 보호 상태

- 기존 inventory stack: 3서비스 healthy
- synthetic staging stack: 3서비스 healthy
- 보호 listener: 1234/6632, 11434/8588, 18765/22716, 18766/65400, 18767/28532 보존
- 기존 dirty worktree: reset·clean·broad staging 없이 보존

## 다음 READY

`P4-G0-DEDICATED-SUPABASE-PROJECT-ORG-COST-AND-CREATION-CONFIRMATION`

Supabase 도구 계약상 새 project 비용 조회 전에 사용자가 대상 조직을 명시해야 한다. 후보는 비품관리 신뢰 경계를 분리할 수 있는 조직이며, 기존 `visionlab-safe-link` 조직을 사용할지 별도 비품관리 조직을 만들지 결정한 뒤 실제 비용을 조회·제시하고 생성 직전 확인을 받는다. 생성 후에도 PITR는 별도 유료 add-on Gate로 유지한다.
