# P4-G1 Supabase 논리 백업·복구 결과

기준일: 2026-08-31

결과: **DB Secret·논리 백업·public 복구 PASS / off-site copy 대기**

## 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| Secret 변수 | [x] | 6/6 populated, 값 미출력 |
| Secret 보호 | [x] | Git 제외, 현재 사용자+SYSTEM ACL |
| SSL 연결 | [x] | Supabase session pooler, PostgreSQL 17.6 |
| 논리 백업 | [x] | 471,726 bytes, custom archive |
| SHA-256 | [x] | manifest 기록 |
| archive 구조 | [x] | 1,002 entries |
| public 복구 | [x] | 482 selected entries |
| 원본/복구 대조 | [x] | 52 tables, 8 non-empty, 40 rows, 3 functions 일치 |
| 임시 자원 정리 | [x] | restore container 제거 |
| off-site copy | [ ] 외부 입력 | 저장소·credential reference 미정 |
| PITR | [ ] 미사용 | Free plan, 비용 변경 없음 |

## 복구 계약

Supabase 플랫폼 전용 extension·system schema는 일반 PostgreSQL에 직접 복원하지 않는다. 새 Supabase provider를 bootstrap한 뒤 migration `001~024`를 적용한다. 업무 `public` schema와 data는 검증된 archive 목록으로 복원한다.

첫 시도는 일반 PostgreSQL에 `supabase_vault`가 없어 중단했고 같은 방식을 반복하지 않았다. 두 번째 시도는 public 함수 3개가 필터에서 빠진 원인을 확인했다. 함수·trigger를 포함한 세 번째 복구는 원본과 모든 집계가 일치했다.

## 다음 READY

`P4-G1-STAGING-OPERATIONS-MANIFEST-DESIGN` — 확인된 Supabase DB·로컬 보안 provider를 실제 staging manifest 계약으로 연결한다.
