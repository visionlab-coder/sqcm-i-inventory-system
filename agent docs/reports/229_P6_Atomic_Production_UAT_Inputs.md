# ACC-P6-41 Atomic Production UAT Inputs

기준일: 2026-09-02

## 결과 / 상태

- [x] Production UAT 승인·ADMIN·MANAGER·USER credential 공용 reader 적용
- [x] 저장소 밖 absolute physical `.json`, exact realpath, 1 byte~64KiB 강제
- [x] actual bytes read 전후 repository·candidate identity·realpath·size 재검증
- [x] fatal UTF-8와 JSON object-only 계약 적용
- [x] symlink/reparse·redirect·동일 크기 교체·크기 변경·과대 입력 차단
- [x] 24시간 초과 backup health를 새 백업·격리 복구로 복구
- [ ] 실제 세 역할 credential 입력·계정 provisioning·MFA/RBAC UAT

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 승인된 변경창의 UAT 입력 무결성을 강화하며 계정·서명·Secret·DNS/TLS·공개 Production 상태를 변경하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 actual UAT 승인·credential 입력 경계만 보완 |
| 산출물 | PASS | 공용 bounded atomic reader, 5개 진입점, 공격 회귀 7건 |
| 검증 | PASS | failure-first 7/7, focused 58/58, 전체 678 PASS·7 SKIP |
| 보안 | PASS | repository/file 재검증·64KiB·fatal UTF-8·원문 비노출 |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `910387a…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | 실제 credential·계정·UAT·서명·DNS/TLS 미실행 |

## 검증 증거

- failure-first → missing module/direct unbounded input read 계약 7/7 EXPECTED FAIL
- focused UAT input·관련 진입점 회귀 → 58 PASS·0 FAIL
- `npm.cmd run check:syntax` → 367/367 PASS
- `npm.cmd run test:unit` → 685 total·678 PASS·7 SKIP·0 FAIL
- 새 Production backup → 318,811 bytes, checksum 기록, restore verified
- 격리 복구 → 필수 table 33/33, migration 25/25, 원본·복구본 건수 일치, 임시 DB 제거
- `npm.cmd run production:operational-health-baseline` → backup/restore age 0분, PASS
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33591475433`, tested SHA `910387a94b0902474538742ad1954011779cbadf` → unit·three-tier-integration SUCCESS
- 보호 포트/PID 4건과 Production frontend/backend/database 3서비스 healthy 보존

## 미완료 / 외부 Gate

실제 P6 완료는 승인된 `2026-09-11 20:00~23:00 KST` 변경창에서 DNS/TLS 공개, 세 역할 계정 provisioning·MFA·RBAC, 12개 Gate, 실제 UAT 결과 3건과 업무·보안·운영 서명 3건을 확보한 뒤에만 가능하다. 이 Packet은 실제 credential을 읽거나 계정·Production 데이터를 변경하지 않았으며 7/8 승격 증거를 대신하지 않는다.
