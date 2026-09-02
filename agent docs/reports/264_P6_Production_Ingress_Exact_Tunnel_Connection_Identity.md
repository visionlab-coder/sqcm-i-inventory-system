# ACC-P6-73 Production Ingress Exact Tunnel Connection Identity

기준일: 2026-09-02

## 결과 / 상태

- [x] Production tunnel을 exact name·UUID·created/deleted 상태로 검증
- [x] exact name 중복과 malformed tunnel list를 외부 변경 전에 차단
- [x] connection UUID·colo·origin IP·openedAt·pending 형식을 검증
- [x] pending reconnect만 있거나 connection이 없으면 connected로 인정하지 않음
- [x] 생성 tunnel ID도 exact UUID로 검증하고 모든 재조회에 같은 selector 적용
- [ ] 실제 Production tunnel 생성·연결과 public cutover

기존 ingress 진입점은 이름으로 필터한 첫 tunnel과 `connections.length`를 직접 신뢰했다. 이번 Packet은 조회할 때마다 tunnel과 connection 전체 identity를 검증하고 실제 active connection만 연결 성공으로 승격한다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 health/readiness 전 Production tunnel identity만 강화 |
| 산출물 | PASS | tunnel/connection selector·connected 판정·failure-first 6건 |
| 검증 | PASS | focused 20 PASS, 전체 816 PASS·8 SKIP |
| 보안 | PASS | malformed·복수·삭제·pending·invalid connection을 fail-closed |
| 추적성 | PASS | 구현 `6895f5d`·GitHub quality `33636215007` |
| Git·Rollback | PASS | exact 구현 3파일, tunnel·DNS·runtime 변경 없음 |
| 외부 Gate | WAIT | 승인 변경창·Cloudflare token·실제 Production tunnel 필요 |

## 검증 증거

- 읽기 전용 실제 `cloudflared tunnel list --output json` → 기존 두 tunnel의 UUID·활성 sentinel·connection 필드 형식 확인, 값·Secret 미기록
- failure-first → selector와 active connection 판정 부재로 6/6 실패 재현
- 집중 tunnel identity·DNS identity·publication 회귀 → 20 PASS·0 FAIL
- `npm.cmd run production:ingress-publication` → `READY_WAIT_INGRESS_PUBLICATION_INPUTS`, 외부 변경 0, actual ingress `NOT_RUN`
- 단위시험 → 824 total·816 PASS·8 SKIP·0 FAIL
- `npm.cmd run harness:verify` → 구문 407/407 포함 전체 검증 봉투 PASS·exit 0
- 보호 listener → `1234/6632`, `11434/8588`, `18765/22716`, `18766/65724` 보존
- GitHub-hosted quality run `33636215007`, commit `6895f5d` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 실제 Production tunnel은 생성·시작하지 않았고 DNS/TLS도 게시하지 않았다.
- 이번 PASS는 provider tunnel 응답 오판을 차단하는 준비 증거이며 실제 public 연결 성공 증거가 아니다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
