# ACC-P6-44 Bounded Cutover Candidate Consumers

기준일: 2026-09-02

## 결과 / 상태

- [x] P6 G4 후보 증거 소비자 5개의 direct unbounded JSON read 제거
- [x] physical regular file·realpath·1 byte~1MiB·read-after 안정성 계약 적용
- [x] fatal UTF-8·JSON object-only 파싱 적용
- [x] 후보 fail-closed 검사와 실행·조립·역할·서명 dry-run 유지
- [x] 외부 변경 0건·`productionGo=false` 확인
- [ ] 실제 P6 cutover·역할별 UAT·3영역 서명·P7 운영 인수

공식 Phase는 P6 6/8이다. 이 Packet은 동일 `P6_G4_CUTOVER_EVIDENCE_CANDIDATE.json`을 권한 근거로 사용하는 실행·증거 조립 진입점의 읽기 경계를 통일했다. 실제 DNS/TLS·계정·Secret·서명·Phase 상태는 변경하지 않았다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 G4 후보 증거 읽기 경계만 강화 |
| 산출물 | PASS | 소비자 5개 전환, 실패 우선 회귀 1건 |
| 검증 | PASS | failure-first 1/1, focused 6/6, 전체 717 PASS·7 SKIP |
| 보안 | PASS | physical·1MiB·realpath·read-after·fatal UTF-8·object-only |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `73094cb…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | 2026-09-11 변경창·Production 사용자·실제 서명 미실행 |

## 검증 증거

- failure-first → 첫 direct 소비자에서 1/1 EXPECTED FAIL
- bounded reader와 소비자 집중 회귀 → 6/6 PASS
- 후보 검사 → `PASS_CANDIDATE_FAIL_CLOSED`, 4 PASS·8 PENDING·`productionGo=false`
- cutover 실행 dry-run → `PASS_CUTOVER_EXECUTION_ENTRYPOINT_DRY_RUN`, 실행 Gate 0·외부 변경 0
- actual evidence·role result·signoff dry-run → 필요한 외부 입력 WAIT, 파일 작성·외부 변경 0
- `npm.cmd run production:cutover-preflight` → local blocker 0, Production 3서비스 healthy, 보호 서비스 보존, 변경창 WAIT
- `npm.cmd run check` → 구문 375/375, 단위 724 total·717 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:verify` → exit 0, P6 6/8 PASS
- GitHub-hosted quality run `33597939948`, tested SHA `73094cb3ed9170d0fc9253d054777efa70824887` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

실제 공개 전환은 승인된 2026-09-11 20:00~23:00 KST 변경창 안에서만 가능하다. Production 역할 사용자·자격증명 참조·실제 역할 UAT·업무/보안/운영 서명과 DNS/TLS 게시가 아직 없으므로 P6 G4와 P7 활성화는 `NOT_RUN`이며 Phase 진행률은 6/8로 유지한다.
