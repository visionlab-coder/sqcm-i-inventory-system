# ACC-P6-69 Production Ingress Process Identity

기준일: 2026-09-02

## 결과 / 상태

- [x] cloudflared 실행 파일 경로를 exact Windows path로 검증
- [x] Production config를 정확한 `--config` 인자로 사용한 프로세스만 인정
- [x] 일치 PID가 둘 이상이면 중복 기동 없이 fail-closed
- [x] prefix 문자열 오탐·실행 파일 불일치·malformed 관측을 차단
- [x] 기존 exact PID가 있으면 재사용하고 새 프로세스를 시작하지 않음
- [x] Linux CI에서도 Windows 대상 경로를 동일하게 검증
- [ ] 실제 Production tunnel process 시작과 DNS/TLS 게시

기존 진입점은 cloudflared 명령줄에 config 경로 문자열이 포함되면 running으로 간주했다. 이번 Packet은 실행 파일·인자·PID 단일성을 구조화된 관측으로 검증해 재시도 중복 기동과 부분 경로 오탐을 차단한다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 ingress 기존 process identity 판정만 강화 |
| 산출물 | PASS | exact process observer·진입점 연결·회귀 5건 |
| 검증 | PASS | failure-first 5건, focused ingress 19 PASS, 전체 793 PASS·8 SKIP |
| 보안 | PASS | 실행 파일·config flag·단일 PID 강제, 불확실 관측 fail-closed |
| 추적성 | PASS | 구현 `68699d1`·CI 수정 `0e22b96`·quality `33631041611` |
| Git·Rollback | PASS | exact 구현 3파일 + CI 호환 1파일, 외부 runtime 변경 없음 |
| 외부 Gate | WAIT | 변경창·Cloudflare token·역할 계정/MFA·실제 서명 필요 |

## 검증 증거

- failure-first → exact process observer와 진입점 연결 부재로 5/5 실패 재현
- 집중 ingress 회귀 → 19 PASS·0 FAIL
- `npm.cmd run production:ingress-publication` → 입력 대기, 외부 변경 0, actual `NOT_RUN`
- `npm.cmd run check` → 구문 403/403, 단위 801 total·793 PASS·8 SKIP·0 FAIL
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS·exit 0
- 첫 GitHub run `33630769277` → Linux에서 Windows path를 host path로 판정해 unit FAIL
- 대체 구현 → `path.win32` 정규화로 대상 OS 계약을 명시, 수용조건 유지
- GitHub-hosted quality run `33631041611`, commit `0e22b96` → unit·three-tier-integration SUCCESS

## 미완료 / 외부 Gate

- 실제 cloudflared process는 시작·종료하지 않았고 Production tunnel·DNS/TLS도 게시하지 않았다.
- 이번 PASS는 변경창 재시도 시 process 단일성 준비이며 실제 공개 전환 증거가 아니다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
