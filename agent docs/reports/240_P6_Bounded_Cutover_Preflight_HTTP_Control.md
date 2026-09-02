# ACC-P6-48 Bounded Cutover Preflight HTTP Control

기준일: 2026-09-02

## 결과 / 상태

- [x] cutover preflight의 HTTP 응답 직접 무제한 `arrayBuffer()` 제거
- [x] 3개 loopback smoke 응답에 5초 timeout·1MiB declared/actual 상한 적용
- [x] fatal UTF-8·JSON object-only fail-closed 계약 적용
- [x] Production 3서비스·smoke·migration·backup/restore·보호 서비스 재확인
- [x] 외부 변경 0건·`productionGo=false`
- [ ] 실제 변경창 cutover·공개 DNS/TLS·역할 MFA·최종 서명

공식 Phase는 P6 `6/8`이다. 변경창 전 read-only preflight HTTP Gate만 강화했으며 DNS/TLS·계정·Secret·컨테이너·볼륨은 변경하지 않았다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 G4 cutover loopback smoke 응답의 bounded 검증 강화 |
| 산출물 | PASS | preflight 진입점 전환과 failure-first 회귀 1건 |
| 검증 | PASS | failure-first 1/1, focused 14/14, 전체 727 PASS·7 SKIP |
| 보안 | PASS | 5초·1MiB·fatal UTF-8·JSON object-only, body oversize reader 취소 |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | 구현 commit `1c3aa40`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | 실제 공개 전환과 역할/서명은 승인 변경창에서만 가능 |

## 검증 증거

- failure-first → bounded HTTP reader 부재를 1/1 EXPECTED FAIL
- HTTP runtime·cutover preflight 집중 회귀 → 14/14 PASS
- 실제 응답 → `/health` 200·36B, `/api/readiness` 200·241B, `/api/items` 401·134B, 모두 JSON 객체
- `npm.cmd run production:cutover-preflight` → `READY_WAIT_CHANGE_WINDOW`, `localBlockers=0`, smoke PASS
- `npm.cmd run check` → 구문 380/380, 단위 734 total·727 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS
- GitHub-hosted quality run `33602773238`, tested commit `1c3aa40` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 승인 변경창: 2026-09-11 20:00~23:00 KST, rollback cutoff 22:00
- Production hostname DNS/TLS, 전용 tunnel, 역할별 실제 MFA/UAT와 서명은 `NOT_RUN`
- 다음 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`다.
