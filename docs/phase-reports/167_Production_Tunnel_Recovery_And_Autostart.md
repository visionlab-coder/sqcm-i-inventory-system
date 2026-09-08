# Production Inventory Tunnel 복구·자동 시작

기준일: 2026-09-08 18:10 KST  
결과: **PASS — Error 1033 복구 및 독립 자동 시작 등록**

## 체크리스트

- [x] 공개 `inventory.safe-link.co.kr` HTTP 530 / Cloudflare 1033 재현
- [x] Production Docker `frontend`, `backend`, `database` 3/3 healthy 확인
- [x] loopback `127.0.0.1:3300/api/health` HTTP 200 확인
- [x] 기존 SQCM-i OS Tunnel 연결 4개와 공개 `/os` HTTP 200 기준선 확인
- [x] Inventory 전용 config·credential physical file과 exact origin 검증
- [x] 기존 Windows `Cloudflared` 서비스를 수정·재시작하지 않고 Inventory 프로세스만 별도 기동
- [x] Inventory Tunnel 연결 4개와 공개 HTTP 200 확인
- [x] SQCM-i OS Tunnel 연결 4개·공개 HTTP 200 및 `safe-link.co.kr` 정상 301 보존
- [x] 현재 사용자 Limited 권한 로그온＋5분 주기 자동 시작 등록
- [x] 중복 실행 `IgnoreNew`, exact Inventory 프로세스 1개, 전체 cloudflared 2개 확인
- [x] 기능–Skill 등록부와 Codex·Claude Skill 미러 동기화

## 원인과 수정

Windows `Cloudflared` 서비스는 `sqcm.safe-link.co.kr → localhost:8787` 전용 설정으로 정상 실행 중이었다. 별도 `inventory.safe-link.co.kr → 127.0.0.1:3300` 프로세스가 2026-09-04 종료된 뒤 자동 기동 대상이 없어 공개 요청이 Error 1033으로 실패했다.

검증된 exact-config spawn 모듈로 Inventory 프로세스만 시작했다. 이후 `SQCMI-Inventory-Production-Tunnel` 예약 작업을 현재 사용자 Limited 권한으로 등록했다. 작업은 보호 SQCM-i Tunnel 연결과 Inventory origin health를 먼저 확인하고, Inventory 연결·프로세스가 모두 없을 때만 기동한다. 다른 Tunnel·서비스·프로세스를 종료하거나 설정을 덮어쓰는 동작은 없다.

## 검증

- process identity/spawn focused test: 10 PASS / 0 FAIL
- watchdog 반복 실행: `PASS_INVENTORY_TUNNEL_AVAILABLE`
- 예약 작업 수동 실행 결과: `0`
- Inventory 연결: 4, SQCM-i OS 연결: 4
- 공개 상태: Inventory 200, SQCM-i OS 200, SAFE-LINK root 301
- Production Compose: 3/3 healthy
- Skill quick validation: 양쪽 PASS, SHA-256 일치

기계 증거: `agent docs/harness/PRODUCTION_TUNNEL_RECOVERY_EVIDENCE.json`
