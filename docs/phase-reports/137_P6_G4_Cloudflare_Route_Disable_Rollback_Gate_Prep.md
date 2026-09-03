# P6-G4 Cloudflare 공개 경로 차단 Rollback Gate 준비

기준일: 2026-09-01

상태: **로컬 준비 완료 / 실제 DNS 변경 NOT_RUN / Production NO-GO**

## 1. 목표·대상

- [x] Zone을 `safe-link.co.kr`로 고정했다.
- [x] Hostname을 `inventory.safe-link.co.kr`로 고정했다.
- [x] Tunnel을 `sqcm-i-inventory-production`으로 고정했다.
- [x] 다른 tunnel·DNS record·서비스는 변경 대상에서 제외했다.

## 2. 실패 우선 계약

- [x] zone·hostname·tunnel 불일치는 실행 전에 실패한다.
- [x] 정확한 CNAME과 tunnel ID가 일치하지 않으면 삭제하지 않는다.
- [x] 승인된 `2026-09-11 20:00~23:00 KST` 밖의 `--execute`는 실패한다.
- [x] exact 확인 문자열과 token file reference가 없으면 안전 대기한다.
- [x] DNS record 삭제 후에도 이름이 해석되면 전파 대기로 판정하며 rollback PASS로 승격하지 않는다.

## 3. 최소 구현

- [x] `production:route-disable` dry-run과 `--execute` 경로를 분리했다.
- [x] dry-run은 token 원문을 읽지 않고 입력 존재 여부만 판정한다.
- [x] execute는 Cloudflare 공식 API에서 exact zone·CNAME을 재조회한 뒤 단일 record만 삭제한다.
- [x] tunnel과 loopback Production 3서비스는 중지하지 않는다.

## 4. 검증

- [x] route-disable 단위 회귀 6/6 PASS
- [x] cutover orchestrator 단위 회귀 5/5 PASS
- [x] JavaScript 구문 183개 PASS
- [x] 저장소 단위 회귀 231/231 PASS
- [x] dry-run `READY_WAIT_ROUTE_DISABLE_INPUTS`, 외부 mutation 0건

## 5. 보안·Secret

- [x] token 값은 코드·로그·문서에 기록하지 않았다.
- [x] `CLOUDFLARE_PRODUCTION_DNS_API_TOKEN_FILE` 참조만 사용한다.
- [x] 요구 권한은 `safe-link.co.kr`의 Zone Read·DNS Edit 최소 범위다.

## 6. 보존·비범위

- [x] staging과 기존 Cloudflare tunnel을 변경하지 않았다.
- [x] SQCM-i 37봇과 보호 포트/PID를 변경하지 않았다.
- [x] 실제 API 호출·DNS 삭제·tunnel 중지·Production 공개 전환은 수행하지 않았다.

## 7. 남은 Gate

- [ ] Production 전용 tunnel 생성 및 정확한 tunnel ID 확인
- [ ] 최소 권한 Cloudflare token file reference 제공
- [ ] 승인 변경창에서 실제 cutover Gate 실행
- [ ] 실패 시 exact route disable 실행·DNS 비해석 증거 확보
- [ ] 역할별 UAT·관측·업무/보안/운영 서명 완료

다음 READY는 계속 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`다. 준비 완료를 실제 rollback 또는 Production GO로 승격하지 않는다.
