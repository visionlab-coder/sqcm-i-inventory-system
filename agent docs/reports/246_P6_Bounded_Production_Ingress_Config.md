# ACC-P6-54 Bounded Production Ingress Config

기준일: 2026-09-02

## 결과 / 상태

- [x] 기존 Production ingress 설정의 직접 무제한 파일 읽기 제거
- [x] 정확한 runtime `cloudflared.yml`만 물리 파일·16KiB·read-after 안정성·fatal UTF-8로 허용
- [x] 과대 파일은 body read 전에, invalid UTF-8은 설정 비교 전에 fail-closed
- [x] ingress·cutover dry-run에서 외부 변경 0건·`productionGo=false`
- [x] 보호 서비스와 Docker 3서비스 불변식 보존
- [ ] 승인 변경창에서 실제 tunnel·DNS/TLS·역할 UAT·서명 실행

공식 Phase는 P6 `6/8`이다. 변경창 실행 전에 기존 ingress 설정 입력 경계만 강화했으며 Production 공개 상태는 변경하지 않았다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | 기존 Production ingress 설정의 bounded·atomic 검증 |
| 산출물 | PASS | 공용 config reader·진입점 연결·failure-first 회귀 |
| 검증 | PASS | failure-first 1/1, focused 26/26, 전체 744 PASS·7 SKIP |
| 보안 | PASS | exact `cloudflared.yml`·16KiB·physical/stable/fatal UTF-8 |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | 구현 commit `fe41e7d`; 기존 config와 외부 상태 미변경 |
| 외부 Gate | WAIT | 2026-09-11 승인 변경창과 실제 token·역할 계정·UAT·서명 필요 |

## 검증 증거

- failure-first → `readProductionIngressConfig` 부재 1/1 EXPECTED FAIL
- ingress config·provider HTTP·DNS fallback 집중 회귀 → 26/26 PASS
- 16KiB 초과 config → content read 0회, invalid UTF-8과 비허용 basename fail-closed
- `production:ingress-publication` → `READY_WAIT_INGRESS_PUBLICATION_INPUTS`, 외부 변경 0건
- `production:cutover-preflight` → `READY_WAIT_CHANGE_WINDOW`, `localBlockers=0`, 보호 서비스 보존
- `npm.cmd run check` → 구문 387/387, 단위 751 total·744 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS
- GitHub-hosted quality run `33610222240`, commit `fe41e7d` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 승인 변경창: 2026-09-11 20:00~23:00 KST, rollback cutoff 22:00
- Cloudflare rollback token 참조, Production ADMIN·MANAGER·USER 계정·MFA·자격증명, actual UAT·서명 증거가 필요하다.
- actual tunnel·DNS/TLS·cutover·P6→P7 승격은 `NOT_RUN`이다.
- 다음 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`다.
