# P6-G4 Production 공개 전환 사전점검

기준일: 2026-09-01 14:25 KST

## 결과

`P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`의 변경창 전 사전점검은 **READY_WAIT_CHANGE_WINDOW**다. 내부 Production 후보·백업·복구·보호 서비스는 정상이나 공개 hostname은 NXDOMAIN이고 Production 전용 tunnel과 실제 사용자가 없다. 공개 변경은 승인된 `2026-09-11 20:00~23:00 KST` 창 밖이므로 실행하지 않았다.

## 체크리스트

- [x] Harness status/check PASS, 진행 중 Phase·READY 각 1건
- [x] 브랜치 HEAD `3f8b2f668d6ef9b9dc34dee7883058c10d22e04c` 원격 일치
- [x] 배포 후보 `e238ab8dab7f4729298ceb7ecc0f874a4a08829a` 유지
- [x] Production frontend/backend/database 3서비스 healthy
- [x] frontend `127.0.0.1:3300`, backend/database host port 0
- [x] 내부 health·readiness·정적자산 200, 익명 업무 API 401
- [x] migration 25/25, Production 사용자 0, seed 0
- [x] 최신 논리 백업 SHA-256·restore drill 검증 상태 유지
- [x] cutover template 12-gate 계약 유효, 실제 승인으로 사용 불가 확인
- [x] 기존 Cloudflare `sqcm-i`, `sqcm-i-inventory-staging` tunnel 각 연결 4개 보존
- [x] 보호 포트/PID `1234/6632`, `11434/8588`, `18765/22716`, `18766/65724` 보존
- [ ] `sqcm-i-inventory-production` 전용 tunnel — 변경창에서 생성
- [ ] `inventory.safe-link.co.kr` DNS — 현재 NXDOMAIN, 변경창에서 게시
- [ ] TLS·외부 HTTPS health/readiness/smoke — DNS 게시 후 실행
- [ ] ADMIN·MANAGER·USER 실제 Production 계정·MFA·RBAC — 사용자 0명으로 NOT_RUN
- [ ] Production 경보 receipt — NOT_RUN
- [ ] 업무·보안·운영 최종 서명 3/3 — NOT_RUN

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
