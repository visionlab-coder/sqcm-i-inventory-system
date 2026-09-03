# ACC-P6-49 Bounded Ingress Provider HTTP Responses

기준일: 2026-09-02

## 결과 / 상태

- [x] Cloudflare API와 DoH A·CNAME 응답의 직접 무제한 `response.json()` 제거
- [x] 응답마다 declared/actual 1MiB 상한·fatal UTF-8·JSON object-only 적용
- [x] 과대 API 응답은 body read 전 차단하고 과대 DoH 응답은 unpublished 성공 승격 차단
- [x] ingress publication·route-disable·cutover preflight 실제 dry-run 재확인
- [x] 외부 변경 0건·Secret 원문 0건·`productionGo=false`
- [ ] 실제 변경창 ingress 게시·공개 DNS/TLS·역할 MFA·최종 서명

공식 Phase는 P6 `6/8`이다. 변경창 실행에 사용될 공급자 응답 경계만 강화했으며 tunnel·DNS·TLS·계정·Secret·컨테이너·볼륨은 변경하지 않았다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 G4 ingress 및 rollback 공급자 응답의 bounded 검증 강화 |
| 산출물 | PASS | 공용 bounded reader 연결, failure-first·oversize 회귀 |
| 검증 | PASS | failure-first 1/1, focused 27/27, 전체 730 PASS·7 SKIP |
| 보안 | PASS | API 10초·DoH 5초·1MiB·fatal UTF-8·object-only·원문 비노출 |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | 구현 commit `7b4fa3e`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | 실제 tunnel/DNS/TLS와 역할/서명은 승인 변경창에서만 가능 |

## 검증 증거

- failure-first → ingress 런타임 bounded reader 부재 1/1 EXPECTED FAIL
- ingress·DoH·route-disable·공용 HTTP runtime 집중 회귀 → 27/27 PASS
- oversize Cloudflare API → body read 전 `INGRESS_PROVIDER_HTTP_INVALID_JSON`
- oversize DoH A/CNAME → `INGRESS_DNS_DOH_FAILED`, unpublished 성공 승격 없음
- `production:ingress-publication` → `READY_WAIT_INGRESS_PUBLICATION_INPUTS`, 외부 변경 0건
- `production:route-disable` → `READY_WAIT_ROUTE_DISABLE_INPUTS`, 외부 변경 0건
- `production:cutover-preflight` → `READY_WAIT_CHANGE_WINDOW`, `localBlockers=0`
- `npm.cmd run check` → 구문 381/381, 단위 737 total·730 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS
- GitHub-hosted quality run `33604109099`, commit `7b4fa3e` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 승인 변경창: 2026-09-11 20:00~23:00 KST, rollback cutoff 22:00
- Cloudflare token reference, Production tunnel/DNS/TLS, 역할별 실제 MFA/UAT와 서명은 `NOT_RUN`
- 다음 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`다.
