# P7 Production Certificate Evidence Compiler 준비

기준일: 2026-09-01

## 결과

- [x] exact Production TLS 관측 입력 계약 고정
- [x] hostname·chain 검증과 TLSv1.2/TLSv1.3 강제
- [x] serial·SHA-256 fingerprint·validFrom/validTo provenance 보존
- [x] 60분 이내 최근 관측과 30일 이상 갱신 lead 강제
- [x] Production health·readiness 200 교차검증
- [x] 갱신 공급자와 운영 책임자 identity reference 강제
- [x] template·staging·loopback·미개시·만료·갱신 임박 인증서 차단
- [x] 저장소 밖 원자적 1회 쓰기와 기존 출력 비덮어쓰기
- [x] 기본 실행은 읽기 전용 dry-run, 실제 관측·증거 생성 0건

## 검증

- `node --test test/unit/operations-certificate-evidence.test.js` → 7/7 PASS
- `npm.cmd run operations:certificate-evidence` → `READY_WAIT_P6_COMPLETION_AND_CERTIFICATE_OBSERVATION`, 입력·출력 2건 대기
- `npm.cmd run check` → JavaScript 구문 206개, 단위 284/284 PASS
- `npm.cmd run harness:verify` → 등록 검증 33/33 종료 코드 0, staging·Production 각 3서비스 healthy
- Secret·계정·외부 API·DNS/TLS mutation → 0건

## 7범주 체크리스트

1. [x] 목표·범위: P7 actual certificate 증거 생성 자동화만 보완
2. [x] 산출물: 입력 계약 template, evaluator, compiler, atomic writer, 명령·테스트
3. [x] 검증: hostname·chain·protocol·fingerprint·유효기간·최근성·health/readiness
4. [x] 보안: 입력·출력은 저장소 밖, Secret·개인정보 원문 미출력
5. [x] 추적성: Queue·MASTER·P7 증거·현재 상태·로드맵 동기화
6. [x] Git·rollback: exact allowlist, 기존 actual 증거 덮어쓰기 금지
7. [ ] 외부 Gate: P6 실제 완료, P7 활성화, Production DNS/TLS 게시와 실제 관측 대기

## 다음 READY

`ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`를 유지한다. P6 G4 완료·P7 활성화·실제 Production TLS 관측 전에는 `--compile`을 실행하지 않는다.
