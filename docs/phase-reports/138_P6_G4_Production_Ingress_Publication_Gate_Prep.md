# P6-G4 Production Ingress Publication Gate 준비

기준일: 2026-09-01

상태: **로컬 실행기 준비 완료 / 외부 변경 NOT_RUN / Production NO-GO**

## 통합 사전검토

| 항목 | 근거·판정 |
|---|---|
| 대상/버전 | Cloudflare Tunnel, 설치본 `cloudflared 2026.7.1`; 업데이트는 이번 범위에서 제외 |
| 목적 | `inventory.safe-link.co.kr`을 AI PC loopback Production `127.0.0.1:3300`에 승인 변경창 동안 연결 |
| 공급자·구성 | Cloudflare 공식 tunnel CLI와 v4 DNS API; 프로젝트 실행기·runtime config |
| 읽는 데이터 | tunnel 목록, origin cert 존재, token file 존재, loopback health, exact DNS record |
| 생성·수정 | exact tunnel이 없을 때 생성, exact runtime config 생성, connector 시작, exact proxied CNAME 생성 |
| 계정·환경 | `safe-link.co.kr` Production zone; staging·기존 tunnel 제외 |
| 최소 권한 | 해당 zone의 Zone Read·DNS Edit token; tunnel 생성은 기존 Cloudflare origin cert 사용 |
| 복구·감사 | exact route-disable 실행기, Cloudflare DNS audit, 실행 JSON; Secret 원문 미기록 |

판정: **ALLOW_WITH_CONDITIONS** — 승인 변경창, exact publication 확인, exact route-disable 확인, rollback token file reference가 모두 있을 때만 실행한다.

데이터 흐름: `AI PC loopback origin → cloudflared Production tunnel → Cloudflare proxied CNAME → 공개 TLS probe·Cloudflare audit`

## 7범주 완료 체크리스트

1. 목표·범위
   - [x] zone·hostname·tunnel·origin·runtime 경로를 exact 고정했다.
   - [x] 기존 tunnel·staging·loopback 서비스·volume은 비범위로 보존한다.
2. 산출물
   - [x] `production:ingress-publication` dry-run/execute 실행기와 Gate 모듈이 존재한다.
   - [x] cutover Gate 5가 publication 후 public probe 순서를 사용한다.
3. 검증
   - [x] ingress focused 7/7, orchestrator 포함 focused 12/12 PASS
   - [x] JavaScript 구문 186개, 단위 회귀 238/238 PASS
4. 보안·Secret
   - [x] token 값은 읽기 전 dry-run에서 사용하지 않으며 로그·문서·Git에 기록하지 않는다.
   - [x] rollback token과 route-disable 확인 없이는 공개하지 않는다.
5. 문서·Harness
   - [x] MASTER_ROADMAP·가속 큐·P6 증거·현재 상태·로드맵을 동기화했다.
6. Git·Rollback
   - [x] 정확한 변경 파일만 검증 대상으로 유지한다.
   - [x] 기존 `production:route-disable`이 exact CNAME 제거와 DNS 비해석을 검증한다.
7. 미완료·다음 Gate
   - [ ] 최소 권한 Cloudflare token file reference가 아직 없다.
   - [ ] tunnel·config·connector·DNS/TLS 실제 생성과 외부 probe는 `NOT_RUN`이다.
   - [ ] 실제 실행은 `2026-09-11 20:00~23:00 KST` 변경창에서만 허용한다.

다음 READY는 계속 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`이며, 가속 큐의 외부 입력 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`다.
