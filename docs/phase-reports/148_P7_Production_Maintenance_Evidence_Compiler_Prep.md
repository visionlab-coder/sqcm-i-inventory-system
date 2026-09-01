# P7 Production Maintenance Evidence Compiler 준비

기준일: 2026-09-01

## 결과

- [x] exact Production 일일 유지보수 실행 입력 계약 고정
- [x] `docs/maintenance.md`와 불변 40자리 release SHA 강제
- [x] 운영자 identity와 실행·완료·다음 일정 provenance 보존
- [x] frontend/API/DB health·5xx·로그인 실패 급증·백업 6종 강제
- [x] 점검 순서·PASS·실행창 안 관측·고유 receipt 강제
- [x] 최근 24시간 실행과 24시간 안의 다음 점검 강제
- [x] 차단 finding 0건과 template·staging·loopback·가변 이미지 차단
- [x] 저장소 밖 원자적 1회 쓰기와 기존 출력 비덮어쓰기
- [x] 기본 실행은 읽기 전용 dry-run, 실제 점검·증거 생성 0건

## 검증

- `node --test test/unit/operations-maintenance-evidence.test.js` → 7/7 PASS
- `npm.cmd run operations:maintenance-evidence` → `READY_WAIT_P6_COMPLETION_AND_MAINTENANCE_EXECUTION`, 입력·출력 2건 대기
- `npm.cmd run check` → JavaScript 구문 212개, 단위 298/298 PASS
- `npm.cmd run harness:verify` → 등록 검증 35/35 종료 코드 0, staging·Production 각 3서비스 healthy
- Secret·계정·실제 점검·외부 메시지·DNS/TLS mutation → 0건

## 7범주 체크리스트

1. [x] 목표·범위: P7 actual maintenance 증거 생성 자동화만 보완
2. [x] 산출물: 입력 계약 template, evaluator, compiler, atomic writer, 명령·테스트
3. [x] 검증: 계약·불변 SHA·운영자·6종 점검·receipt·최근성·다음 일정
4. [x] 보안: 입력·출력은 저장소 밖, Secret·개인정보 원문 미출력
5. [x] 추적성: Queue·MASTER·P7 증거·현재 상태·로드맵 동기화
6. [x] Git·rollback: exact allowlist, 기존 actual 증거 덮어쓰기 금지
7. [ ] 외부 Gate: P6 실제 완료, P7 활성화, 실제 Production 일일 점검 실행 대기

## 다음 READY

`ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`를 유지한다. P6 G4 완료·P7 활성화·실제 일일 점검 전에는 `--compile`을 실행하지 않는다.
