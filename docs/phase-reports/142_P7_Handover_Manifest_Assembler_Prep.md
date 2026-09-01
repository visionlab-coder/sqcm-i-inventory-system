# P7 운영 인수 Manifest Assembler 준비

기준일: 2026-09-01

## 결과

- [x] P7 실제 증거 10문서의 SHA manifest 자동 조립기 준비
- [x] P6 evidence-complete와 P7 in-progress 선행조건 강제
- [x] 입력 10건·저장소 밖 출력 경로·정확한 확인 문자열 강제
- [x] 조립 전에 schema 2 finalizer로 10/10 검증
- [x] 원자적 1회 쓰기와 기존 출력 비덮어쓰기
- [x] 기본 실행은 읽기 전용 dry-run, 현재 manifest 생성 0건

## 검증

- `node --test test/unit/operations-handover-assembler.test.js` → 6/6 PASS
- `npm.cmd run operations:handover-assembler` → `READY_WAIT_P6_COMPLETION_AND_HANDOVER_FILES`, 누락 11건
- `npm.cmd run check` → JavaScript 구문 194개, 단위 256/256 PASS
- Secret·계정·외부 API·Production mutation → 0건

## 7범주 체크리스트

1. [x] 목표·범위: 실제 P7 manifest 조립 자동화만 보완
2. [x] 산출물: evaluator, assembler, atomic writer, 명령·테스트
3. [x] 검증: P6/P7 상태, 누락, dry-run, 확인, 원자성·비덮어쓰기
4. [x] 보안: 출력은 저장소 밖, Secret·개인정보 원문 미출력
5. [x] 추적성: Queue·MASTER·P7 증거·현재 상태·로드맵 동기화
6. [x] Git·rollback: exact allowlist, 기존 증거 덮어쓰기 금지
7. [ ] 외부 Gate: P6 실제 완료, P7 활성화, 10개 실제 증거·서명 대기

## 다음 READY

`ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`를 유지한다. P6 G4 완료 전에는 assembler의 `--assemble`을 실행하지 않는다.
