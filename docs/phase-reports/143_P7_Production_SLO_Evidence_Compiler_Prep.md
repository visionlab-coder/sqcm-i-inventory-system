# P7 Production SLO Evidence Compiler 준비

기준일: 2026-09-01

## 결과

- [x] exact Production URL의 30일 측정 원본 계약 고정
- [x] 가용성·p95를 원본 샘플에서 직접 계산
- [x] 30일 기간과 30개 이상 UTC 날짜 커버리지 강제
- [x] 가용성 99.5% 이상·p95 1000ms 이하 임계치 강제
- [x] staging·기간 부족·중복/무효 샘플·SHA 누락 차단
- [x] 계약 template·loopback 측정의 actual 증거 승격 차단
- [x] 저장소 밖 원자적 1회 쓰기와 기존 출력 비덮어쓰기
- [x] 기본 실행은 읽기 전용 dry-run, 실제 SLO 증거 생성 0건

## 검증

- `node --test test/unit/operations-slo-evidence.test.js` → 7/7 PASS
- `npm.cmd run operations:slo-evidence` → `READY_WAIT_P6_COMPLETION_AND_SLO_INPUT`, 입력·출력 2건 대기
- `npm.cmd run check` → JavaScript 구문 197개, 단위 263/263 PASS
- Secret·계정·외부 API·Production mutation → 0건

## 7범주 체크리스트

1. [x] 목표·범위: P7 actual SLO 증거 생성 자동화만 보완
2. [x] 산출물: 입력 계약 template, evaluator, compiler, atomic writer, 명령·테스트
3. [x] 검증: 상태 Gate, 30일 측정, 임계치, provenance, 원자성·비덮어쓰기
4. [x] 보안: 입력·출력은 저장소 밖, Secret·개인정보 원문 미출력
5. [x] 추적성: Queue·MASTER·P7 증거·현재 상태·로드맵 동기화
6. [x] Git·rollback: exact allowlist, 기존 actual 증거 덮어쓰기 금지
7. [ ] 외부 Gate: P6 실제 완료, P7 활성화, 30일 Production 측정 원본 대기

## 다음 READY

`ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`를 유지한다. P6 G4 완료·P7 활성화·실제 30일 측정 전에는 `--compile`을 실행하지 않는다.
