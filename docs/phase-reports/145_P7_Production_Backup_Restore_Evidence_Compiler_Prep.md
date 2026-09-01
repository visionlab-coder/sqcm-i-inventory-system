# P7 Production Backup·Restore Evidence Compiler 준비

기준일: 2026-09-01

## 결과

- [x] 동일 Production backup·restore drill export 계약 고정
- [x] backup 24시간 RPO·30일 retention·off-site storage·artifact checksum 강제
- [x] restore 동일 backup ID·격리 target·4시간 RTO 강제
- [x] source/restored row-count digest와 schema migration 일치 검증
- [x] 운영 책임자·Production URL·원본 SHA provenance 보존
- [x] template·staging·loopback·source DB 복원·부분 검증 차단
- [x] 저장소 밖 두 문서 원자적 동시 쓰기와 기존 출력 비덮어쓰기
- [x] 기본 실행은 읽기 전용 dry-run, 실제 drill·증거 생성 0건

## 검증

- `node --test test/unit/operations-backup-restore-evidence.test.js` → 7/7 PASS
- `npm.cmd run operations:backup-restore-evidence` → `READY_WAIT_P6_COMPLETION_AND_BACKUP_RESTORE_DRILL`, 입력 1건·출력 2건 대기
- `npm.cmd run check` → JavaScript 구문 203개, 단위 277/277 PASS
- `npm.cmd run harness:verify` → 등록 검증 32/32 종료 코드 0, staging·Production 각 3서비스 healthy
- Secret·계정·외부 API·Production mutation → 0건

## 7범주 체크리스트

1. [x] 목표·범위: P7 actual backup·restore 증거 생성 자동화만 보완
2. [x] 산출물: 입력 계약 template, evaluator, compiler, atomic pair writer, 명령·테스트
3. [x] 검증: RPO·retention·off-site·checksum·동일 backup·격리·RTO·count/migration
4. [x] 보안: 입력·출력은 저장소 밖, Secret·개인정보 원문 미출력
5. [x] 추적성: Queue·MASTER·P7 증거·현재 상태·로드맵 동기화
6. [x] Git·rollback: exact allowlist, 부분 출력 제거, 기존 actual 증거 덮어쓰기 금지
7. [ ] 외부 Gate: P6 실제 완료, P7 활성화, actual Production backup·restore drill 대기

## 다음 READY

`ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`를 유지한다. P6 G4 완료·P7 활성화·실제 off-site backup과 격리 restore drill 전에는 `--compile`을 실행하지 않는다.
