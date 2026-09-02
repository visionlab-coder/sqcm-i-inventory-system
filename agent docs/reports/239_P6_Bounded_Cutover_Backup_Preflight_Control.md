# ACC-P6-47 Bounded Cutover Backup Preflight Control

기준일: 2026-09-02

## 결과 / 상태

- [x] cutover preflight의 backup manifest 직접 무제한 JSON read 제거
- [x] 최신 exact Production manifest를 64KiB bounded physical reader로 검증
- [x] manifest의 restore 표시뿐 아니라 실제 dump bytes·streaming SHA-256 재검증
- [x] Production 3서비스·loopback smoke·migration·보호 서비스 불변식 재확인
- [x] 외부 변경 0건·`productionGo=false`
- [ ] 실제 변경창 cutover·공개 DNS/TLS·역할 MFA·최종 서명

공식 Phase는 P6 `6/8`이다. 변경창 전 read-only preflight의 backup Gate만 강화했으며 DNS/TLS·계정·Secret·컨테이너·볼륨은 변경하지 않았다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 G4 cutover backup preflight의 실제 artifact 검증 강화 |
| 산출물 | PASS | preflight 진입점 전환과 failure-first 회귀 1건 |
| 검증 | PASS | failure-first 1/1, focused 20/20, 전체 726 PASS·7 SKIP |
| 보안 | PASS | physical·64KiB·realpath·fatal UTF-8·object-only·streaming SHA-256 |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | 구현 commit `55a812e`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | 실제 공개 전환과 역할/서명은 승인 변경창에서만 가능 |

## 검증 증거

- failure-first → bounded backup selector 부재를 1/1 EXPECTED FAIL
- preflight·backup runtime 집중 회귀 → 20/20 PASS
- `npm.cmd run production:cutover-preflight` → `READY_WAIT_CHANGE_WINDOW`, `localBlockers=0`
- latest Production backup → 318,811 bytes, manifest 673 bytes, 두 SHA-256 형식과 restore 검증 PASS
- `npm.cmd run check` → 구문 379/379, 단위 733 total·726 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS
- GitHub-hosted quality run `33601613188`, tested commit `55a812e` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 승인 변경창: 2026-09-11 20:00~23:00 KST, rollback cutoff 22:00
- Production hostname DNS/TLS, 전용 tunnel, 역할별 실제 MFA/UAT와 서명은 `NOT_RUN`
- 다음 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`다.
