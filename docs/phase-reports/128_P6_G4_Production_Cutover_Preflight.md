# P6-G4 Production 공개 전환 사전점검

기준일: 2026-09-01 16:56 KST

## 결과

`P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`의 변경창 전 사전점검은 **READY_WAIT_CHANGE_WINDOW**다. 내부 Production 후보·백업·복구·보호 서비스는 정상이나 공개 hostname은 NXDOMAIN이고 Production 전용 tunnel과 실제 사용자가 없다. 공개 변경은 승인된 `2026-09-11 20:00~23:00 KST` 창 밖이므로 실행하지 않았다.

## 체크리스트

- [x] Harness status/check PASS, 진행 중 Phase·READY 각 1건
- [x] 작업 기준 브랜치 HEAD `479192d8945ab3aa2d844cb2e866d5211059714c` 원격 일치, quality run `33483370863` 성공
- [x] 배포 후보 `e238ab8dab7f4729298ceb7ecc0f874a4a08829a` 유지
- [x] Production frontend/backend/database 3서비스 healthy
- [x] frontend `127.0.0.1:3300`, backend/database host port 0
- [x] 내부 health·readiness·정적자산 200, 익명 업무 API 401
- [x] migration 25/25, Production 사용자 0, seed 0
- [x] 최신 논리 백업 SHA-256·restore drill 검증 상태 유지
- [x] cutover template 12-gate 계약 유효, 실제 승인으로 사용 불가 확인
- [x] `npm.cmd run production:cutover-preflight` 실시간 검사기 구현·Harness 등록
- [x] 변경창 전·변경창 내·최종 서명 READY·로컬 손상 fail-closed 회귀 4/4 PASS
- [x] Production 공급자 5종 읽기 전용 preflight PASS: PostgreSQL 저장소·Defender/경보·AI health/ready·event publisher
- [x] 공개 DNS·TLS·외부 health/readiness 5경로 자동 probe와 변경창 밖 게시 fail-closed 회귀 4/4 준비
- [x] backend 5xx·치명 오류·error level·outbox retry/dead-letter 기준선 및 변경창 Gate 자동화 준비
- [x] ADMIN·MANAGER·USER active user·MFA·credential file reference를 Secret 원문 없이 판정하는 core smoke preflight 자동화와 회귀 4/4 준비
- [x] loopback Production 60요청 부하·보안 헤더·익명 401·cross-site 403 nonfunctional 기준선 자동화 준비
- [x] loopback health/readiness·DB 운영 카운터·최근 5xx·백업 checksum/age·restore drill/age operational health 기준선 자동화 준비
- [x] missing-CSRF 403·세션 불변·idempotency 10열/unique index·stuck/invalid 0건 기준선 자동화 준비
- [x] 현재 이미지 revision·named volume 2/2·이전 중지/복구 drill·backup/restore·22:00 cutoff·전용 route 제거 rollback dry-run 자동화와 회귀 4/4 준비
- [x] ADMIN·MANAGER·USER Production UAT 결과와 업무·보안·운영 서명 참조 6건, 후보 PENDING 상태, 변경창을 fail-closed 판정하는 최종 서명 preflight 자동화와 회귀 4/4 준비
- [x] 12개 cutover Gate 증거 후보 자동 조립: 로컬 실증 4/12 PASS
- [x] 외부 Production 검증 8/12와 서명 3건 PENDING 유지
- [x] 후보가 Production GO를 승인하지 못하는 fail-closed 검사 PASS
- [x] 저장소 표준 구문 156개·단위 180/180 PASS(공급자·공개 probe·로그·역할·nonfunctional·operational health·CSRF/idempotency·rollback·최종 서명 preflight 포함)
- [x] 기존 Cloudflare `sqcm-i`, `sqcm-i-inventory-staging` tunnel 각 연결 4개 보존
- [x] 보호 포트/PID `1234/6632`, `11434/8588`, `18765/22716`, `18766/65724` 보존
- [ ] `sqcm-i-inventory-production` 전용 tunnel — 변경창에서 생성
- [ ] `inventory.safe-link.co.kr` DNS — 현재 NXDOMAIN, 변경창에서 게시
- [ ] TLS·외부 HTTPS health/readiness/smoke — DNS 게시 후 실행
- [ ] ADMIN·MANAGER·USER 실제 Production 계정·MFA·RBAC — 사용자 0명으로 NOT_RUN
- [ ] 역할별 credential file reference 3건 — 현재 0/3, Secret 생성·입력은 수행하지 않음
- [ ] Production 경보 receipt — NOT_RUN
- [ ] 변경창 이후 `logs_5xx` 실제 재검사 — 기준선만 PASS
- [ ] 공개 HTTPS 대상 nonfunctional 재검사 — loopback 기준선만 PASS
- [ ] 변경창 이후 operational health 재검사 — loopback 기준선만 PASS
- [ ] 인증 사용자 CSRF 정상 쓰기·동일 idempotency key replay — 시험계정이 없어 NOT_RUN
- [ ] 공개 전환 이후 실제 route 제거·loopback 복귀 rollback — dry-run readiness만 PASS
- [ ] 업무·보안·운영 최종 서명 3/3 — NOT_RUN
- [ ] 역할별 Production UAT 결과·최종 서명 파일 참조 — 현재 0/6, 파일 내용·Secret은 읽거나 기록하지 않음

## 변경창 실행 순서

1. 20:00 KST 시간 Gate와 후보 SHA·백업·보호 포트를 재확인한다.
2. 기존 두 tunnel을 수정하지 않고 `sqcm-i-inventory-production` 전용 tunnel을 생성한다.
3. origin을 `http://127.0.0.1:3300`, hostname을 `inventory.safe-link.co.kr`로 고정한다.
4. connector 확인 후 DNS를 게시하고 TLS·외부 health/readiness/smoke를 수행한다.
5. 승인된 실제 ADMIN·MANAGER·USER 계정으로 로그인·MFA·RBAC 역조건을 검증한다.
6. 로그·5xx·경보 receipt와 12개 cutover Gate를 채우고 책임자 서명 3/3을 기록한다.
7. 22:00까지 필수 Gate 미통과 시 공개 route를 제거하고 loopback-only 상태로 복귀한다.

## 판정

P6는 아직 완료가 아니며 전체 진행률은 `6/8`, `productionGo=false`다. 다음 READY는 동일한 P6-G4다. 변경창 이전 자동 실행은 내부 health·백업·SHA·보호 서비스 드리프트만 재검사하고, 공개 tunnel·DNS·TLS는 변경하지 않는다.

자동화는 더 이상 단순 상태 조회만 하지 않는다. `production:cutover-preflight`가 원격 SHA, Docker 3서비스·포트, smoke, migration·사용자 수, 백업 복원, 보호 PID, Cloudflare tunnel, DNS와 변경창을 실시간으로 판정하고 로컬 불변식 손상 시 즉시 실패한다.

`npm.cmd run production:cutover-evidence`는 G3·G4·P5와 Production 공급자 정본에서 cutover 증거 후보를 조립·대조한다. 현재 `artifact`, `backup_restore`, `migration_review`, `provider_preflight`만 PASS이며 나머지 8개 Gate와 Production 역할 결과·최종 서명은 PENDING이다. 내부 공급자 probe나 staging 서명을 공개 Production health·smoke 증거로 승격하지 않는다.

`npm.cmd run production:signoff-preflight`는 실제 Production 역할 결과와 최종 서명 참조 6건이 모두 있고 승인 변경창 안일 때만 검증 준비 상태를 연다. 현재는 0/6이므로 `READY_WAIT_PRODUCTION_UAT_AND_SIGNOFF_REFERENCES`이며 참조 파일의 존재만 확인할 뿐 실제 서명을 자동 생성하거나 완료로 승격하지 않는다.
