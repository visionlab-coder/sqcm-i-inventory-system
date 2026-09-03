# ACC-P6-66 Production Ingress Publication Durability

기준일: 2026-09-02

## 결과 / 상태

- [x] cloudflared config를 fsync·hard-link no-replace로 게시
- [x] tunnel credential을 원문 read 없이 fsync·hard-link no-replace로 게시
- [x] config 경쟁 시 선점 bytes 보존·내부 임시파일 제거
- [x] credential 경쟁 시 선점 bytes와 복구용 생성 credential 보존
- [x] tunnel create 명령 성공을 후속 파싱·게시 실패 전에도 외부 변경으로 기록
- [x] Windows read-only fsync 실패를 최소 권한의 `r+` flush handle로 대체
- [ ] 실제 Production tunnel·DNS·TLS 게시와 역할 UAT·서명

기존 실행기는 config를 최종 경로에 직접 `wx`로 쓰고 cloudflared가 만든 credential을 `rename`으로 게시했다. 또한 tunnel 생성 성공 뒤 credential 게시가 실패하면 `tunnelCreated=false`로 오보고할 수 있었다. 이번 보완은 공개 실행 권한이나 변경창을 넓히지 않고 파일 게시와 외부 변경 추적만 fail-closed로 강화했다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 ingress config·credential publication과 mutation 추적만 수정 |
| 산출물 | PASS | 두 durable publisher·진입점 연결·경쟁 회귀 5건·기계 증거 |
| 검증 | PASS | failure-first 4건, Windows 대체 구현, focused 31 PASS, 전체 779 PASS·8 SKIP |
| 보안 | PASS | Secret 본문 미열람·기존 최종 bytes 보존·물리 경로와 크기 상한 유지 |
| 추적성 | PASS | 구현 SHA `3e347ae`·GitHub quality `33626411866`·Harness verify 연결 |
| Git·Rollback | PASS | exact 3파일 구현 commit·credential 충돌 시 복구용 생성 파일 유지 |
| 외부 Gate | WAIT | 변경창·Cloudflare token reference·역할 계정/MFA·실제 서명 필요 |

## 검증 증거

- failure-first → durable publisher 2개 부재로 4/4 실패 재현
- 첫 구현 → Windows read-only handle `fsync`의 `EPERM` 2건 재현
- 대체 구현 → credential 본문을 읽지 않고 `r+` handle로 fsync한 뒤 hard-link no-replace 게시
- 집중 회귀 → 31 PASS·0 FAIL
- `npm.cmd run check` → 구문 400/400, 단위 787 total·779 PASS·8 SKIP·0 FAIL
- `npm.cmd run production:ingress-publication` → `READY_WAIT_INGRESS_PUBLICATION_INPUTS`, 외부 변경 0, 실제 ingress `NOT_RUN`
- `npm.cmd run production:cutover-preflight` → `READY_WAIT_CHANGE_WINDOW`, local blocker 0, 3서비스 healthy
- `npm.cmd run harness:verify` → 전체 검증 봉투 PASS
- GitHub-hosted quality run `33626411866`, commit `3e347ae` → unit·three-tier-integration SUCCESS
- 보호 포트/PID `1234/6632`, `11434/8588`, `18765/22716`, `18766/65724` 보존

## 미완료 / 외부 Gate

- 이번 PASS는 변경창 실행기의 파일 게시 내구성과 상태 추적 준비이며 실제 공개 전환 증거가 아니다.
- `inventory.safe-link.co.kr` DNS는 미게시이고 Production tunnel은 생성되지 않았다.
- Cloudflare token reference와 Production 역할 사용자·MFA·실제 결과·서명은 준비되지 않았다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
