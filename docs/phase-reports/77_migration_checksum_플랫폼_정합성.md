# Phase 77 migration checksum 플랫폼 정합성

기준일: 2026-08-17
상태: 증거 있는 완료

## 목표와 범위

Windows checkout의 CRLF와 Linux·컨테이너의 LF가 동일한 SQL migration에 서로 다른 SHA-256을 만들던 문제를 해소한다. SQL 내용 변경 감지, 기존 migration 이력, Docker 3서비스 불변식은 유지한다.

## 원인과 변경

- 원인: `src/db.js`가 파일의 원시 줄바꿈을 포함해 checksum을 계산했다.
- `src/migration-checksum.js`에서 CRLF와 단독 CR을 LF로 정규화한 뒤 SHA-256을 계산한다.
- 기존 Windows 환경에서 기록했을 수 있는 CRLF checksum은 호환 후보로만 인정한다.
- `.gitattributes`가 `db/migrations/*.sql`을 LF로 고정한다.
- `runMigrations`와 `verifyMigrations`가 같은 checksum 계약을 사용한다.
- SQL 본문이 달라지면 checksum 후보가 겹치지 않는 단위 테스트를 추가했다.

## 검증 증거

| 검증 | 실제 결과 |
|---|---|
| `node --test test/unit/migration-checksum.test.js` | 2/2 PASS |
| `npm.cmd run check` | JavaScript 구문 95개, 단위 109/109 PASS |
| `npm.cmd run db:verify` | 실행 중 PostgreSQL 16에서 migration 22/22 일치 |
| `npm.cmd run test:integration` | PostgreSQL·HTTP 통합 20/20 PASS |
| `npm.cmd run maintenance:check` | frontend/backend 200, 필수 테이블 32개, 유지보수 점검 PASS |
| `npm.cmd run ui:contract` | 13 PASS |
| `npm.cmd run compose:contract` | backend/database/frontend 정확히 3서비스 PASS |
| `npm.cmd run repository:hygiene` | 고정 자격증명·Mock 제작 메타데이터·PNG 제작 청크 0건 |
| PR #17 quality CI | `unit`, `three-tier-integration` PASS |
| main quality CI | 병합 SHA `a5abc374109438f7ee8c9e5683839ed568d13de8`의 두 job PASS |
| main `release-images` | frontend/backend SHA 태그·provenance 발행 PASS |

DB 연결 문자열은 실행 중 backend 컨테이너에서 읽어 로컬 프로세스 환경에만 주입했으며 출력·파일·문서에 기록하지 않았다.

## 경계와 남은 게이트

- 운영 DB migration, production 배포, DNS/TLS, Secret, UAT는 수행하지 않았다.
- PR #17은 검증된 코드 SHA `286da737bfb8df1fd26a1302994c0117d99ff361`로 병합됐고 main SHA는 `a5abc374109438f7ee8c9e5683839ed568d13de8`이다.
- AI PC 관련 기존 미추적 문서와 `agent docs/Agent.md` 사용자 변경은 이번 변경에 포함하지 않는다.
