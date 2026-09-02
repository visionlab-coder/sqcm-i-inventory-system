# ACC-P6-74 Production Ingress Secret-Free Tunnel Create Acknowledgement

기준일: 2026-09-02

## 결과 / 상태

- [x] 공식 cloudflared create JSON 출력의 `token` 포함 계약 확인
- [x] `--output json`과 `JSON.parse(createOutput)` 제거
- [x] Secret 없는 default `Created tunnel <name> with id <uuid>` 확인문만 엄격 파싱
- [x] 생성 직후 원격 tunnel을 최대 5회 bounded 재조회하고 exact UUID 일치 검증
- [x] 재관측·UUID 일치 전 credential/config 게시 금지
- [x] tunnel 생성 직후 `tunnelCreated=true`로 외부 mutation을 정확히 기록
- [ ] 실제 Production tunnel 생성·연결과 public cutover

공식 `cloudflared` 소스의 `TunnelWithToken`은 JSON에 `token` 필드를 포함하고 create 경로는 JSON 출력 시 해당 구조를 렌더링한다. 기존 진입점은 출력값을 외부에 기록하지 않았지만 Secret을 stdout으로 받아 메모리에서 파싱하면서 `secretValuesReadOrRecorded=false`라고 보고했다. 이번 Packet은 JSON 출력을 요청하지 않고 Secret 없는 기본 acknowledgement와 원격 재관측만 사용한다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 tunnel create acknowledgement와 Secret 경계만 강화 |
| 산출물 | PASS | Secret-free parser·remote UUID acknowledgement·failure-first 5건 |
| 검증 | PASS | focused 25 PASS, 전체 821 PASS·8 SKIP |
| 보안 | PASS | token-bearing JSON output 거부, Secret stdout 요청 제거 |
| 추적성 | PASS | 구현 `a2ce439`·GitHub quality `33637736026` |
| Git·Rollback | PASS | exact 구현 4파일, tunnel·DNS·runtime 변경 없음 |
| 외부 Gate | WAIT | 승인 변경창·Cloudflare token reference·실제 Production tunnel 필요 |

## 검증 증거

- 설치된 `cloudflared tunnel create --help` → create가 tunnel 등록과 credential 생성을 수행하고 `--output json`을 지원함을 읽기 확인
- 공식 소스 `cfapi/tunnel.go` → `TunnelWithToken.Token`이 `json:"token"`으로 직렬화됨을 확인
- 공식 소스 `subcommand_context.go` → create JSON 출력에서 tunnel-with-token 구조를 렌더링함을 확인
- failure-first → Secret-free parser·재관측·순서 계약 부재로 5/5 실패 재현
- 집중 tunnel create/tunnel/DNS/publication 회귀 → 최종 25 PASS·0 FAIL
- 전체 회귀의 과거 JSON 파싱 순서 테스트 1건을 새 강화 계약으로 교체 후 재검증 PASS
- 단위시험 → 829 total·821 PASS·8 SKIP·0 FAIL
- `npm.cmd run harness:verify` → 구문 408/408 포함 전체 검증 봉투 PASS·exit 0
- GitHub-hosted quality run `33637736026`, commit `a2ce439` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 실제 Production tunnel은 생성·시작하지 않았고 credential/config·DNS/TLS도 게시하지 않았다.
- 이번 PASS는 생성 출력의 Secret 취급과 원격 acknowledgement를 보강한 준비 증거이며 실제 public 연결 성공 증거가 아니다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
