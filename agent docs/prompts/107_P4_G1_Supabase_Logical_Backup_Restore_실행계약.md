# P4-G1 Supabase Logical Backup Restore 실행계약

ROLE:
SQCM-i staging Supabase 논리 백업·복구 검증자.

GOAL:
Free plan 전용 Supabase 프로젝트를 SSL session pooler로 백업하고, Secret을 노출하지 않은 상태에서 업무 public schema·data의 복구 가능성과 원본 일치를 증명한다.

SCOPE:
- `.env.staging.local` Secret 변수 존재·ACL·Git 제외 검사
- PostgreSQL 17 `pg_dump` custom archive 생성
- SHA-256·archive TOC 구조 검증
- 격리 PostgreSQL 17 public schema·data 복구 훈련
- Supabase 원본과 복구본 table·row·function 수 대조
- Harness·로드맵·현재상태 증거 갱신

OUT OF SCOPE:
- Secret 값 출력·문서화·Git 기록
- Supabase plan·PITR·schema 변경
- 원본 Supabase restore·삭제·reset
- DNS/TLS·Cloudflare·Production 변경
- commit·push·merge·release

WORKFLOW:
1. Harness와 Secret 파일 보호 상태를 확인한다.
2. Supabase session pooler SSL 연결과 PostgreSQL 버전을 확인한다.
3. `pg_dump -Fc --no-owner --no-privileges`로 새 백업을 생성한다.
4. checksum과 `pg_restore --list`를 검증한다.
5. 일반 PostgreSQL에서 Supabase 전용 확장 실패를 분리하고 동일 방식을 반복하지 않는다.
6. migration 24개가 전용 확장·정책을 소유하도록 유지하고 public 업무 schema·data를 격리 DB에 복구한다.
7. 원본과 복구본 수치를 비교하고 임시 컨테이너를 제거한다.

INPUTS / SOURCE OF TRUTH:
1. 현재 사용자의 Secret 저장 승인과 완료 통지
2. `MASTER_ROADMAP.json`, migration 001~024, 전용 Supabase project
3. 실제 Secret metadata·Docker·backup archive·Supabase SQL 관측
실제 관측값을 우선하되 Secret 보호와 원본 비파괴 조건을 낮추지 않는다.

AUTHORITY / PERMISSIONS:
- 읽기: 로컬 Secret metadata, Docker, Supabase database
- 로컬 쓰기: `artifacts/backups` 신규 archive·manifest와 Agent Docs·Harness
- 외부 쓰기: 없음

CONSTRAINTS:
- 비밀번호는 환경 메모리로만 전달하고 출력하지 않는다.
- 기존 backup을 덮어쓰지 않는다.
- 원본 Supabase에는 SELECT 이외 SQL을 실행하지 않는다.
- 같은 원인의 실패가 3회 반복되면 중단한다.

SUCCESS CRITERIA:
- SSL session pooler 연결 PASS, PostgreSQL 17.6 확인
- custom archive 1KB 초과, SHA-256과 TOC 검증
- public table·non-empty table·row·function 수 원본/복구본 일치
- 임시 restore 컨테이너 제거
- 보호 listener 보존

FAILURE CRITERIA / STOP CONDITION:
- Secret 누출·Git 추적·ACL 확대가 발견된다.
- archive 생성·목록 검증 또는 최종 public 복구가 실패한다.
- 원본/복구본 수치가 다르다.
- 같은 원인이 3회 반복되거나 기존 서비스가 변경된다.

VERIFICATION / EVIDENCE:
- `npm.cmd run harness:status`, `npm.cmd run harness:check`
- PostgreSQL 17 `psql`, `pg_dump`, `pg_restore --list`
- 격리 restore DB의 table·row·function count
- Supabase read-only baseline query
- SHA-256, ACL, Docker cleanup, 보호 PID

OUTPUTS / FORMAT:
- `artifacts/backups/sqcm-i-supabase-staging-20260831T034703Z.dump.json`
- `agent docs/harness/P4_G1_SUPABASE_BACKUP_EVIDENCE.json`
- `docs/phase-reports/107_P4_G1_Supabase_Logical_Backup_Restore.md`
- Harness·로드맵·현재상태 동기화
