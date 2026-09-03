# ACC-P7-50 Bounded Improvement Queue HTTP Response

기준일: 2026-09-02

## 결과 / 상태

- [x] GitHub API 요청 15초 제한 유지
- [x] 페이지별 Content-Length 1MiB 초과 선차단
- [x] chunked 응답 actual bytes 1MiB 초과 즉시 차단·reader 취소
- [x] fatal UTF-8 decoding과 JSON array 계약 적용
- [x] `response.json()` 무제한 buffering 제거
- [x] 최대 10페이지·1,000 Issue 기존 상한 유지
- [ ] P6 완료 후 실제 승인된 GitHub 개선큐 읽기와 export 생성

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 P7 개선큐 수집기의 GitHub HTTP 응답 경계만 강화하며 token 사용, GitHub read, Issue 변경 또는 export 쓰기를 수행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | GitHub Issue page response read·decode·parse 경계만 보완 |
| 산출물 | PASS | bounded page reader, 진입점 적용, 공격 회귀 테스트 |
| 검증 | PASS | failure-first 4/4·공격 5건, focused 10/10, 전체 620 PASS·6 SKIP |
| 보안 | PASS | 15초·1MiB·fatal UTF-8·array-only·원문 비노출 |
| 추적성 | PASS | 큐·Harness·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `22e62319…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | P6 cutover·P7 활성화·실제 GitHub 수집 미실행 |

## 검증 증거

- failure-first → bounded reader와 진입점 적용 전 4/4 EXPECTED FAIL, 공격 시나리오 5건
- focused → 10/10 PASS·0 FAIL
- `operations:improvement-queue-collector` → `READY_WAIT_P6_ACTUAL_CUTOVER`, GitHub read·Secret 사용·write 0건
- `npm.cmd run check` → 구문 351/351, 단위 620 PASS·6 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6/P7 전체 PASS
- GitHub-hosted quality run `33581546968`, tested SHA `22e6231991fe79137dd5c56787a0b028b89fa15e` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

P6 actual cutover·P7 활성화·Production GO·물리 GitHub token·triage attestation·신규 output·정확한 확인이 모두 있어야 실제 읽기 전용 수집이 열린다. 합성 Response 테스트는 실제 GitHub 운영 큐 증거를 대신하지 않는다.
