# P7-G0 운영 인수 사전점검

기준 시각: 2026-09-03 11:51 KST

## 결과

P6 actual cutover 증거를 기준으로 P7 운영 인수 계약을 점검했다. 계약 오류는 0건이며 P7-G0는 완료했다. 다음 READY는 `P7-G1-OPERATIONS-ACTIVATION-AND-SIGNOFF`다.

## 7범주 체크리스트

- [x] 목표·범위: Production 운영 8영역과 책임자 인수 입력 경계를 확인했다.
- [x] 정본·provenance: P6 run `c0901830-e0f4-45ac-b0c7-6eddf6318480`, release `d91d9c3...`, actual evidence SHA-256을 고정했다.
- [x] 공개 상태: `https://inventory.safe-link.co.kr` Production GO를 유지했다.
- [x] SLO: 실제 HTTPS 표본 첫날 1/30을 저장소 밖 원장에 기록했다.
- [x] 인증서: Cloudflare TLS의 hostname·chain·health·readiness를 관측하고 실제 증거를 컴파일했다.
- [x] 유지보수: frontend/API/DB/5xx/login-failure/backup 6개 일일점검을 실행하고 실제 증거를 컴파일했다.
- [x] 안전·불변식: Secret 원문을 기록하지 않았고 Production 3서비스와 보호 서비스를 변경하지 않았다.

## 미완료 실제 운영 입력

- [ ] SLO: 서로 다른 UTC 날짜 29일을 추가 관측해야 한다.
- [ ] 경보: 승인된 공개 HTTPS 공급자·채널·수신자와 5종 수신 영수증이 필요하다.
- [ ] 백업/복원: AI PC와 다른 failure domain의 off-site 저장소 및 격리 복원 drill이 필요하다.
- [ ] 온콜: PRIMARY·ESCALATION 실제 ACK 영수증이 필요하다.
- [ ] 개선 큐: GitHub operations triage attestation과 읽기용 credential reference가 필요하다.
- [ ] 최종 인수: 8영역 완료 후 운영 책임자 MFA 서명이 필요하다.

## 증거

- `npm.cmd run harness:verify` → PASS, P7, 7/8
- `npm.cmd run operations:slo-collector -- --collect` → `PASS_SLO_SAMPLE_APPENDED`, 1/30
- `npm.cmd run operations:certificate-evidence -- --compile` → `PASS_CERTIFICATE_EVIDENCE_COMPILED`
- `npm.cmd run operations:maintenance-evidence -- --compile` → `PASS_MAINTENANCE_EVIDENCE_COMPILED`
- 기계 증거: `agent docs/harness/P7_G0_OPERATIONS_HANDOVER_PREFLIGHT_EVIDENCE.json`
