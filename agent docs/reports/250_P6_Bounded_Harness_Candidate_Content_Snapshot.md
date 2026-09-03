# ACC-P6-58 Bounded Harness Candidate Content Snapshot

기준일: 2026-09-02

## 결과 / 상태

- [x] Goal Harness의 P2 candidate content 직접 무제한 파일 읽기 제거
- [x] 저장소 상대 정규 경로·중복 없음·physical regular file·exact realpath 강제
- [x] 파일당 8MiB·최대 512개·합계 64MiB를 content read 전에 검사
- [x] 모든 파일을 각각 한 번 읽고 전체 집합의 read 전후 identity·realpath·size 재검사
- [x] cutover preflight 외부 변경 0건·`productionGo=false`
- [ ] 승인 변경창에서 actual 12-Gate·역할 UAT·3종 서명 실행

공식 Phase는 P6 `6/8`이다. 원격 release evidence가 아직 없는 fallback 경로에서도 후보 파일 경로 이탈·과대 입력·혼합 시점 hash를 fail-closed하도록 보완했으며 Production 공개 상태는 변경하지 않았다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | Harness release candidate content fallback의 bounded atomic 판정 |
| 산출물 | PASS | 공용 snapshot reader·Harness 연결·failure-first 회귀 |
| 검증 | PASS | failure-first 5/5, focused 5/5, 전체 759 PASS·7 SKIP |
| 보안 | PASS | path containment·physical file·8MiB/64MiB·single read·full-set stable |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵 동기화 |
| Git·Rollback | PASS | 구현 commit `44ea5c8`; 소스 3파일 exact commit·원격 CI 성공 |
| 외부 Gate | WAIT | 2026-09-11 승인 변경창과 actual 12-Gate·역할·서명 증거 필요 |

## 검증 증거

- failure-first → snapshot module·Harness 연결 부재 5/5 EXPECTED FAIL
- candidate content 집중 회귀 → 5/5 PASS
- `../` 경로 이탈·중복 경로 → content read 0건에서 거부
- 파일당·합계 상한 초과 → content read 0건에서 거부
- 첫 파일 read 후 다른 파일 변경 → 전체 snapshot 불안정으로 거부
- `production:cutover-preflight` → `READY_WAIT_CHANGE_WINDOW`, `localBlockers=0`, 보호 서비스 보존
- `npm.cmd run check` → 구문 394/394, 단위 766 total·759 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS
- GitHub-hosted quality run `33615976460`, commit `44ea5c8` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 승인 변경창: 2026-09-11 20:00~23:00 KST, rollback cutoff 22:00
- 실제 Cloudflare token, Production 역할 계정·MFA·자격증명, actual UAT·업무·보안·운영 서명이 필요하다.
- actual cutover gate PASS·DNS/TLS·P6→P7 승격은 `NOT_RUN`이다.
- 다음 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`다.
