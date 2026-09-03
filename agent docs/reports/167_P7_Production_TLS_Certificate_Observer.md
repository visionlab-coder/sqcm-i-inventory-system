# ACC-P7-17 Production TLS Certificate Observer

## 결과

- [x] P6 actual 완료 전 HTTP read/write 0건
- [x] P7 활성화와 Production GO 필수
- [x] exact `inventory.safe-link.co.kr` 고정
- [x] 시스템 trust store의 TLS chain·hostname 검증
- [x] health·readiness의 동일 peer certificate 강제
- [x] TLSv1.2/1.3, serial, SHA-256 fingerprint, 유효기간 수집
- [x] `/health`·`/api/readiness` HTTP 200 강제
- [x] 저장소 밖 신규 물리 파일에 원자적 1회 쓰기
- [x] focused test 5/5 PASS
- [x] JavaScript syntax 261/261 PASS
- [x] repository unit 391 PASS·0 FAIL·1 Windows platform SKIP
- [x] Harness verify PASS

## 현재 판정

`npm.cmd run operations:certificate-observer`는 `READY_WAIT_P6_ACTUAL_CUTOVER`를 반환했다. `externalHttpReadPerformed=false`, `localEvidenceWritePerformed=false`, `externalMutationPerformed=false`이며 실제 Production TLS 관측은 `NOT_RUN`이다.

## 실제 실행 입력

- `P7_CERTIFICATE_OBSERVATION_INPUT_FILE`: 저장소 밖 신규 출력 파일
- `P7_CERTIFICATE_RENEWAL_OWNER_REF`: `identity://...` 운영 책임자 참조
- `P7_CERTIFICATE_PROVIDER_REF`: `provider://...` 인증서 공급자 참조
- `P7_CERTIFICATE_OBSERVATION_CONFIRMATION`: exact 실행 확인 문자열

P6 actual 완료와 P7 활성화 뒤에만 `npm.cmd run operations:certificate-observer -- --observe`를 실행한다.
