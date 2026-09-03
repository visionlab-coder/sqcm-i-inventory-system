# ACC-P6-46 Bounded Rollback G3 Control

기준일: 2026-09-02

## 결과 / 상태

- [x] rollback readiness의 G3 direct unbounded JSON read 제거
- [x] physical regular file·realpath·1 byte~1MiB·read-after 안정성 적용
- [x] fatal UTF-8·JSON object-only 파싱 적용
- [x] 실제 Production 이미지 revision·필수 볼륨·과거 drill·backup/restore 재검증
- [x] 외부 변경 0건·실제 rollback `NOT_RUN`·`productionGo=false`
- [ ] 실제 P6 cutover·실패 시 공개 route 차단·P7 운영 인수

공식 Phase는 P6 6/8이다. rollback 판단에 사용되는 G3 배포·백업·복구 증거의 파일 읽기 경계만 강화했으며 Docker 관측은 읽기 전용으로 수행했다. route·DNS/TLS·계정·Secret·컨테이너·볼륨은 변경하지 않았다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | rollback G3 제어 증거 읽기 경계만 강화 |
| 산출물 | PASS | 진입점 전환과 failure-first 회귀 1건 |
| 검증 | PASS | failure-first 1/1, focused 16/16, 전체 725 PASS·7 SKIP |
| 보안 | PASS | physical·1MiB·realpath·read-after·fatal UTF-8·object-only |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `9180569`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | 실제 cutover와 route-disable는 변경창에서만 가능 |

## 검증 증거

- failure-first → direct G3 read가 bounded reader 계약을 1/1 EXPECTED FAIL
- bounded reader·rollback policy/runtime 집중 회귀 → 16/16 PASS
- `npm.cmd run production:rollback-readiness` → `PASS_ROLLBACK_READINESS_DRY_RUN_ONLY`
- backend/frontend revision 일치, 필수 volume 2/2, 이전 drill·backup/restore PASS
- `npm.cmd run check` → 구문 378/378, 단위 732 total·725 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:check` → P6 6/8, 오류 0
- GitHub-hosted quality run `33600215170`, tested commit `9180569` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

실제 공개 전환과 실패 시 route 차단은 승인된 2026-09-11 20:00~23:00 KST 변경창 안에서만 수행한다. 역할 사용자·자격증명·실제 UAT·3영역 서명이 없으므로 P6 G4와 P7은 완료로 승격하지 않는다.
