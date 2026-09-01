# P7 Production On-call Evidence Compiler 준비

기준일: 2026-09-01

## 결과

- [x] exact Production 온콜 인수 입력 계약 고정
- [x] Asia/Seoul 기준 30일 이상 연속 당번표 강제
- [x] 서로 다른 primary·escalation 책임자와 양측 수락 시각 강제
- [x] 최근 7일 escalation drill과 역할 일치 강제
- [x] primary 5분·escalation 15분 이내 acknowledgement 강제
- [x] 고유 receipt·당번표·drill provenance 보존
- [x] template·staging·loopback·동일 책임자·느린/오래된 drill 차단
- [x] 저장소 밖 원자적 1회 쓰기와 기존 출력 비덮어쓰기
- [x] 기본 실행은 읽기 전용 dry-run, 담당자 지정·메시지·실제 증거 생성 0건

## 검증

- `node --test test/unit/operations-oncall-evidence.test.js` → 7/7 PASS
- `npm.cmd run operations:oncall-evidence` → `READY_WAIT_P6_COMPLETION_AND_ONCALL_HANDOVER`, 입력·출력 2건 대기
- `npm.cmd run check` → JavaScript 구문 209개, 단위 291/291 PASS
- `npm.cmd run harness:verify` → 등록 검증 34/34 종료 코드 0, staging·Production 각 3서비스 healthy
- Secret·계정·담당자 지정·외부 메시지·DNS/TLS mutation → 0건

## 7범주 체크리스트

1. [x] 목표·범위: P7 actual onCall 증거 생성 자동화만 보완
2. [x] 산출물: 입력 계약 template, evaluator, compiler, atomic writer, 명령·테스트
3. [x] 검증: 당번표 기간·시간대·책임자 분리·수락·drill receipt·응답시간·최근성
4. [x] 보안: 입력·출력은 저장소 밖, Secret·개인정보 원문 미출력
5. [x] 추적성: Queue·MASTER·P7 증거·현재 상태·로드맵 동기화
6. [x] Git·rollback: exact allowlist, 기존 actual 증거 덮어쓰기 금지
7. [ ] 외부 Gate: P6 실제 완료, P7 활성화, 실제 당번표·책임자 수락·drill receipt 대기

## 다음 READY

`ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`를 유지한다. P6 G4 완료·P7 활성화·실제 온콜 인수와 drill 전에는 `--compile`을 실행하지 않는다.
