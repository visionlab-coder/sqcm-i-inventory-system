# P6-G1 무료 PostgreSQL Production 구조 결과

기준일: 2026-09-01

결과: **LOCAL CONTRACT PASS / HOLD_PRODUCTION_VM_PROVIDER_AND_RUNNER / Production NO-GO / 6/8 유지**

## 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| Supabase 유료 전환 | ✅ 취소 | checkout을 닫았고 조직은 Free, 결제·카드 입력·Production project 생성 0 |
| 기존 staging | ✅ 보존 | `iuoljos…` ACTIVE_HEALTHY, staging Docker 3/3 healthy |
| Production DB | ✅ 로컬 계약 통과 | PostgreSQL 16, application migration 25/25 |
| Production 파일 저장 | ✅ 로컬 계약 통과 | `file_blobs BYTEA`, write/read/delete/health PASS, 5 MiB 상한 |
| 인증 | ✅ fail-closed | 로컬 비밀번호 + MFA 필수. 미등록 계정은 Production 세션 발급 전 차단 |
| 배포 설정 | ✅ 계약 통과 | PostgreSQL storage·local MFA 구성으로 Production deploy precheck PASS |
| 3서비스 불변식 | ✅ 보존 | `frontend/backend/database` 정확히 3개 |
| backup·restore 범위 | ✅ 코드 반영 | `file_blobs`를 logical backup 복구 대조와 maintenance 필수 테이블에 포함 |
| 전용 VM·runner | ☐ HOLD | 승인된 사양은 있으나 공급자·고정 주소·월 비용·실제 runner 없음 |
| Production 복구정책 | ☐ HOLD | PostgreSQL full backup·WAL 보관, RPO/RTO와 off-site 대상 확정 필요 |
| Git·CI | ☐ HOLD | 현재 변경은 로컬 미커밋이며 current SHA PR·CI·불변 이미지 없음 |

## 구현 결과

업무 데이터는 원래부터 `postgres:16-alpine`의 `database` 서비스가 소유했다. 이번 변경은 Supabase Production project를 새로 만들지 않고, `026_postgres_file_blobs.sql`과 `PostgresFileStore`를 추가해 증빙 파일도 같은 PostgreSQL backup 경계에 포함했다. 별도 객체 저장 서비스는 추가하지 않아 Compose 3서비스 계약을 유지했다.

Production은 `AUTH_PROVIDER=local`, `PRODUCTION_LOCAL_AUTH_MFA_REQUIRED=true`, `FILE_STORAGE_DRIVER=postgres`, `DB_MIGRATION_HISTORY_MODE=application`으로 고정한다. MFA 미등록 사용자는 올바른 비밀번호를 입력해도 세션을 받지 못하며 감사 이벤트가 기록된다. 따라서 cutover 전 실제 Production 사용자 3역할의 MFA 등록·복구코드 인수 증거가 필수다.

## 검증 증거

- `npm.cmd run check`: 구문 125, 단위 147/147 PASS
- `npm.cmd run postgres:contract`: 격리 DB application migration 25/25, BLOB write/read/delete/health PASS, 임시 DB 제거
- Production 정책값 `deploy-precheck`: PASS
- `npm.cmd run compose:contract`: `backend/database/frontend`, count 3
- `npm.cmd run ui:contract`: 20 PASS
- `git diff --check`: 오류 0
- 보호 listener: 1234/PID 6632, 11434/PID 8588, 18765/PID 22716 보존

## 남은 Gate

P6-G1은 코드·비용 구조 공백을 해소했지만 외부 실행 대상이 아직 없다. 다음 READY는 동일한 `P6-G1-PRODUCTION-TARGET-CHANGE-WINDOW-AND-PROVIDER-INPUT`이며 범위는 `sqcm-i-inventory-prod-01`의 공급자·고정 주소·월 비용, 프로젝트 전용 self-hosted runner, PostgreSQL backup/WAL·off-site·RPO/RTO 확정이다. 실제 VM·DNS/TLS·Secret·migration·배포는 수행하지 않았고 `productionGo=false`를 유지한다.
