# ACC-P7-51 Bounded Operations Preflight HTTP Responses

기준일: 2026-09-02

## 결과 / 상태

- [x] OIDC discovery와 AI health/readiness GET 요청 10초 제한 유지
- [x] Content-Length 1MiB 초과 body read 전 차단
- [x] chunked actual bytes 1MiB 초과 즉시 차단·reader 취소
- [x] malformed Content-Length fail-closed
- [x] OIDC fatal UTF-8와 JSON object-only 계약 적용
- [x] 무제한 `arrayBuffer()`·`json()` buffering 제거
- [ ] P6 완료 후 승인된 실제 Production provider live probe

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 P7 운영 provider preflight의 HTTP 응답 경계만 강화하며 live provider probe, Secret 사용, 계정·DNS·TLS·외부 데이터 변경을 수행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | OIDC discovery와 AI GET response read·decode·parse 경계만 보완 |
| 산출물 | PASS | bounded HTTP runtime, 진입점 연결, 공격 회귀 테스트 |
| 검증 | PASS | failure-first 5/5, focused 5/5, 전체 625 PASS·6 SKIP |
| 보안 | PASS | 10초·1MiB·reader 취소·fatal UTF-8·object-only·원문 비노출 |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `46489a50…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 actual cutover·P7 활성화·승인된 live provider probe 미실행 |

## 검증 증거

- failure-first → bounded runtime 부재와 기존 unbounded helper로 5/5 EXPECTED FAIL
- focused → 5/5 PASS·0 FAIL
- `operations:preflight` template → PASS, live probe 미실행
- `operations:contracts` → manifest·cutover template 계약 PASS
- `npm.cmd run check` → 구문 353/353, 단위 625 PASS·6 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33582520819`, tested SHA `46489a50e9d6e82e3cb96ae8b807b0773c0d5d9a` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

실제 provider probe는 P6 actual cutover·P7 활성화, 승인된 Production manifest와 외부 연결 조건이 충족된 뒤 수행한다. template 검증과 합성 Response 테스트는 실제 OIDC·AI provider 운영 증거를 대신하지 않는다.
