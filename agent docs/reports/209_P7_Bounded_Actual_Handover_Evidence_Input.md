# ACC-P7-16 Bounded Actual Handover Evidence Input

기준일: 2026-09-02

## 결과 / 상태

- [x] P7 handover 최상위 manifest의 저장소 밖 절대 JSON 경로 강제
- [x] 10개 하위 문서의 external base 상대경로 confinement
- [x] physical regular file·real path 일치 강제
- [x] symlink·reparse·parent redirect·저장소 내부 차단
- [x] 파일별 1 byte 이상·4MiB 이하 bounded read
- [x] JSON object·actual bytes·SHA-256 검증
- [x] finalizer·assembler·8/8 completion 동일 reader 사용
- [ ] 실제 P7 운영 인수 10문서 생성·검증·서명

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 P7 actual handover 입력의 느슨한 파일 read 우회 경로를 닫지만 P7 활성화·서명·8/8 전환을 실행하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P7 actual handover 최종 입력 경계만 보완 |
| 산출물 | PASS | bounded physical reader, 세 진입점 공통 적용, failure-first 회귀 |
| 검증 | PASS | failure-first 6건·1 platform skip, focused 21 PASS·1 SKIP, 전체 582 PASS·4 SKIP |
| 보안 | PASS | external physical path·4MiB·JSON object·redacted 오류 fail-closed |
| 추적성 | PASS | 큐·Harness·상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 구현 commits `75b2856…`, `79e8105…`, 검증 대체 경로 `c83e0ac…`; 코드 rollback 가능 |
| 외부 Gate | WAIT | P6 cutover·P7 활성화·실제 10문서·운영 서명 미실행 |

## 검증 증거

- failure-first → bounded P7 handover reader 미구현 6/6 EXPECTED FAIL·Windows symlink 1 SKIP
- focused → finalizer·assembler·phase completion 21 PASS·1 SKIP·0 FAIL
- `npm.cmd run operations:handover-finalizer` → `READY_WAIT_P6_COMPLETION_AND_HANDOVER_EVIDENCE`
- `npm.cmd run operations:phase-completion` → `READY_WAIT_ACTUAL_HANDOVER_EVIDENCE_FOR_8_OF_8`, 변경 0건
- `npm.cmd run check` → 구문 342/342, 단위 582 PASS·4 SKIP·0 FAIL
- `npm.cmd run repository:hygiene` → 고정 자격증명 0
- GitHub-hosted quality run `33574636520`, tested SHA `c83e0ac5c82f8bb087bc47294661fb1855cfd7da` → unit·three-tier-integration SUCCESS
- `npm.cmd run harness:verify` → exit 0, public probe·handover finalizer 포함 전체 PASS

## 실패와 대체 경로

첫 원격 unit 실행은 Linux에서 Windows 구분자 fixture를 파일명으로 해석해 실패했다. 제품 계약은 유지하고 fixture를 `path.join('..', 'escaped.json')`으로 바꿔 Windows·Linux에서 동일한 경로 탈출 반례를 검증했다. 이어 Harness의 native DNS 관측 timeout이 두 번 반복되어, 이미 시험된 authoritative Cloudflare DoH NXDOMAIN 대체 관측을 public probe에 연결했다. 권한·한도·도메인은 확대하지 않았고 공개 HTTPS 요청이나 DNS 변경도 실행하지 않았다.

## 미완료 / 외부 Gate

P6 actual cutover 완료 뒤 실제 경보·off-site backup·격리 복원·TLS·온콜·정기점검·개선 큐·운영 서명 10문서를 생성하고 동일 finalizer를 통과해야 한다. reader PASS만으로 P7 완료 또는 8/8 전환이 되지 않는다.
