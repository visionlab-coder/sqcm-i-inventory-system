# ACC-P6-45 Atomic Cutover Evidence Control Snapshot

기준일: 2026-09-02

## 결과 / 상태

- [x] G3·G4·P5·provider·candidate 5개 제어 JSON을 단일 snapshot으로 결합
- [x] 파일별 정확히 1회 actual bytes read와 SHA-256 계산
- [x] 전체 read 전후 repository root와 5개 파일 identity·realpath·size 재검증
- [x] 양방향 cross-file 변경·과대·invalid UTF-8·array·redirect 차단
- [x] 후보 4 PASS·8 PENDING·`productionGo=false` 유지
- [ ] 실제 P6 cutover·역할별 UAT·3영역 서명·P7 운영 인수

공식 Phase는 P6 6/8이다. 후보 하나를 안전하게 읽는 것에 더해 후보와 이를 만든 네 원천 증거를 같은 시점의 bounded physical snapshot으로 검증한다. 실제 DNS/TLS·계정·Secret·서명·Phase 상태는 변경하지 않았다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 G4 후보와 원천 증거의 cross-file 일관성만 강화 |
| 산출물 | PASS | 5파일 snapshot reader·진입점 연결·회귀 테스트 |
| 검증 | PASS | failure-first 1/1, focused 8/8, 전체 724 PASS·7 SKIP |
| 보안 | PASS | physical·1MiB·realpath·read-after·fatal UTF-8·object-only |
| 추적성 | PASS | 가속 큐·Harness README·현재 상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commit `2768627…`; 단일 커밋 revert 가능 |
| 외부 Gate | WAIT | 2026-09-11 변경창·Production 사용자·실제 서명 미실행 |

## 검증 증거

- failure-first → 기존 separate source read가 atomic snapshot 계약을 1/1 EXPECTED FAIL
- focused snapshot·consumer 회귀 → 8/8 PASS
- source→candidate 및 candidate→source 중간 변경 → 2/2 차단
- `npm.cmd run production:cutover-evidence` → `PASS_CANDIDATE_FAIL_CLOSED`, 4 PASS·8 PENDING·Production NO-GO
- `npm.cmd run check` → 구문 377/377, 단위 731 total·724 PASS·7 SKIP·0 FAIL
- `npm.cmd run harness:check` → P6 6/8, 오류 0
- GitHub-hosted quality run `33599251899`, tested SHA `27686276894e8e986c65d9e41c208a575a74fe7e` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

실제 공개 전환은 승인된 2026-09-11 20:00~23:00 KST 변경창 안에서만 가능하다. Production 역할 사용자·자격증명 참조·실제 역할 UAT·업무/보안/운영 서명과 DNS/TLS 게시가 아직 없으므로 P6 G4와 P7 활성화는 `NOT_RUN`이며 Phase 진행률은 6/8로 유지한다.
