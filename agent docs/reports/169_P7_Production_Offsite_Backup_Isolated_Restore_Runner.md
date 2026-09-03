# ACC-P7-19 Production Off-site Backup and Isolated Restore Runner

## 결과

- [x] P6 actual·P7 활성화·Production GO 전 Production read/write 0건
- [x] exact Production PostgreSQL container 고정
- [x] repeatable-read exported snapshot으로 counts와 `pg_dump` 일관성 보장
- [x] 별도 failure-domain·암호화-at-rest·승인 root SHA-256 binding
- [x] off-site custom-format dump와 SHA-256 검증
- [x] 30일 이상 retention 계약
- [x] 무작위 격리 DB 생성·복원·항상 제거
- [x] 33 tables·25 migrations·전체 counts digest 일치
- [x] 4시간 이내 RTO
- [x] focused test 6/6 PASS
- [x] JavaScript 구문 267/267 PASS
- [x] 전체 단위 402 PASS·Windows-only 1 SKIP·0 FAIL (403 total)
- [x] `npm.cmd run harness:verify` PASS

## 현재 판정

`npm.cmd run operations:backup-restore-runner`는 `READY_WAIT_P6_ACTUAL_CUTOVER`를 반환했다. `productionReadPerformed=false`, `offsiteWritePerformed=false`, `isolatedDatabaseMutationPerformed=false`, `externalMutationPerformed=false`이며 실제 Production backup/restore drill은 `NOT_RUN`이다.

## 실제 실행 입력

- `P7_OFFSITE_BACKUP_ROOT`: 프로젝트 드라이브와 다른 실제 암호화 저장소 root
- `P7_OFFSITE_STORAGE_ATTESTATION_FILE`: 승인·암호화·retention·root hash 계약
- `P7_BACKUP_RESTORE_DRILL_INPUT_FILE`: 저장소 밖 신규 export 파일
- `P7_BACKUP_RESTORE_RUNNER_CONFIRMATION`: exact 실행 확인

P6 actual 완료와 P7 활성화 뒤에만 `npm.cmd run operations:backup-restore-runner -- --execute`를 실행한다. Root hash는 승인된 실제 root의 정규화된 절대경로 소문자 UTF-8 SHA-256이다.
