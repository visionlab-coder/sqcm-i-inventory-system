# ACC-P6-31 Ingress DNS DoH Fallback

기준일: 2026-09-02

## 결과 / 상태

- [x] 반복 native DNS timeout 재현·세 번째 blind retry 중단
- [x] native 실패 때만 Cloudflare 공개 DoH fallback
- [x] A·CNAME authoritative 응답과 NXDOMAIN 판정
- [x] 두 경로 실패·published/NXDOMAIN 충돌 fail-closed
- [x] provider 오류 원문 미기록·외부 변경 0건
- [ ] 변경창 실제 DNS/TLS 게시와 공개 HTTPS 검증

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 Harness 부하에서 반복된 native DNS 관측 timeout을 같은 보안 기준의 읽기 전용 DoH 경로로 대체하지만 DNS 레코드·터널·TLS를 생성하거나 unpublished를 추측하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | 반복 DNS 관측 실패의 읽기 전용 대체 경로만 보완 |
| 산출물 | PASS | resilient observer, DoH observer, failure-first 회귀 |
| 검증 | PASS | failure-first 4건, focused 7/7, 전체 541 PASS·1 SKIP |
| 보안 | PASS | native 우선, authoritative DoH, conflict/both-fail 차단, raw error 미기록 |
| 추적성 | PASS | 큐·Harness·상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 3파일 구현 commit, GitHub quality 검증 |
| 외부 Gate | WAIT | 2026-09-11 실제 tunnel·DNS/TLS 게시 대기 |

## 검증 증거

- repeated Harness failure → `production-ingress-publication` native DNS observation exit 1, 개별 실행은 일시 복구
- failure-first → resilient/DoH observer 부재 4/4 EXPECTED FAIL
- focused → native timeout fallback·published·both-fail·DoH authoritative 계약 7/7 PASS
- `npm.cmd run production:ingress-publication` → `READY_WAIT_INGRESS_PUBLICATION_INPUTS`, mutation 0, actual `NOT_RUN`
- `npm.cmd run check` → 구문 330/330, 단위 541 PASS·Windows symlink 1 SKIP·0 FAIL
- GitHub-hosted quality run `33567691253`, tested SHA `1b1661676e9f5dbc08c45dc0c4868ea53ca38fed` → `unit`, `three-tier-integration` 모두 `SUCCESS`
- `npm.cmd run harness:verify` → exit 0, `production-ingress-publication`·`production-public-probe` 포함 전체 Gate PASS

## 미완료 / 외부 Gate

fallback은 읽기 전용 DNS 관측만 수행한다. 승인된 변경창 전에는 전용 tunnel 생성, config 실행, Cloudflare DNS 게시, TLS·공개 HTTPS 확인을 수행하지 않는다.
