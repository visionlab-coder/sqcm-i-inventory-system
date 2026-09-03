# P6-G4 Production DNS·TLS 전환·서명 실행계약

ROLE: SQCM-i 비품관리 공개 Production 전환·서명 Gate 관리자다.

GOAL: P6-G3 loopback 배포 후보를 승인된 변경창에만 `inventory.safe-link.co.kr`로 공개하고, TLS·실사용자 로그인·MFA·관측·rollback 기준과 업무·보안·운영 최종 서명을 실제 증거로 닫는다.

SCOPE:
- `inventory.safe-link.co.kr`의 승인된 DNS/TLS·ingress 대상 확인과 게시
- 후보 SHA `e238ab8dab7f4729298ceb7ecc0f874a4a08829a`의 외부 health·smoke
- ADMIN·MANAGER·USER 실제 Production 인증·MFA·권한 역조건
- 공개 전환 로그·경보 receipt·rollback 판정과 최종 3분야 서명
- P6-G4 증거·로드맵·Harness 동기화

OUT OF SCOPE:
- 2026-09-03 10:00 KST 이전 공개 전환
- seed·합성 fixture를 Production에 생성하거나 staging 데이터를 복사하는 행위
- 보호 서비스·37봇·staging 중단, backend/database 직접 공개
- 별도 승인 없는 main merge·유료 서비스·결제·방화벽 약화

WORKFLOW: Inspect → 시간 Gate·대상·rollback 책임 확인 → 변경 직전 backup → DNS/TLS·ingress 게시 → 외부 health/smoke → 역할별 로그인·MFA·권한 → 로그·경보 receipt → 22:00 rollback cutoff 판정 → 업무·보안·운영 서명 → 상태 동기화

INPUTS / SOURCE OF TRUTH:
1. 승인된 변경창 `2026-09-03 10:00~13:00 KST`, rollback cutoff `12:00 KST`
2. `agent docs/harness/MASTER_ROADMAP.json`과 P6-G3 기계 증거
3. DNS zone의 실제 레코드·TLS·ingress endpoint와 Production 시험 계정
4. 후보 SHA·digest, 실제 Docker·HTTP·DB·로그·경보 상태

AUTHORITY / PERMISSIONS:
- 자동 허용: 변경창 전 로컬 preflight·백업·계약·불변식 검증과 증거 문서 준비
- 변경창 내 허용: 확정된 Production ingress 대상에 대한 DNS/TLS 게시, 외부 probe와 승인된 시험계정 검증
- 외부 입력: DNS zone 권한, 실제 ingress endpoint, ADMIN·MANAGER·USER 자격증명 reference, 3분야 서명
- 금지: Secret 원문 기록, 대상 불명 상태의 DNS 게시, main merge, backend/database 호스트 공개

CONSTRAINTS:
- 공개 변경은 2026-09-03 10:00~13:00 KST에만 수행하고 12:00까지 필수 Gate 실패 시 트래픽을 차단한다.
- frontend/backend/database 정확히 3서비스와 backend/database host port 0을 유지한다.
- Production 사용자·MFA는 실제 승인된 계정만 사용하고 Seed는 영구 금지한다.
- staging·37봇·보호 포트 `1234`, `11434`, `18765`, `18766`을 보존한다.

SUCCESS CRITERIA:
- DNS가 확정 ingress만 가리키며 유효 TLS와 외부 health/readiness/smoke가 통과한다.
- ADMIN·MANAGER·USER 로그인·MFA와 역할·조직 격리 역조건이 실제 Production에서 PASS한다.
- 5xx·보안 경보·Secret 노출 0, 운영 경보 receipt와 rollback 가능 상태가 확인된다.
- 업무·보안·운영 책임자 3/3 서명과 cutover SHA·digest·시간 증거가 연결된다.

FAILURE CRITERIA:
- 변경창·대상·자격증명·서명 중 하나라도 없거나 TLS·인증·관측 검증 실패
- 22:00까지 필수 Gate 미통과, backend/database 공개, 보호 서비스 변화
- 동일 원인 실패 3회, Secret 노출, rollback 불가

VERIFICATION / EVIDENCE:
- `npm.cmd run harness:status`, `npm.cmd run harness:check`, `npm.cmd run harness:verify`
- 변경 직전 backup·restore 가능 증거, DNS/TLS 조회, 외부 HTTPS health/readiness/smoke
- 역할별 실제 로그인·MFA·RBAC·조직 격리, Docker health·포트·로그·경보 receipt
- cutover/rollback 타임라인, 후보 SHA·digest, 책임자 서명 3/3

OUTPUTS / FORMAT:
- `agent docs/harness/P6_G4_PRODUCTION_CUTOVER_SIGNOFF_EVIDENCE.json`
- `docs/phase-reports/128_P6_G4_Production_DNS_TLS_Cutover_Signoff.md`
- 체크리스트 PASS/FAIL/NOT_RUN과 시간·SHA·증거 링크를 기록하되 Secret 원문은 제외한다.
- P6 완료 시에만 완료 수를 7/8로 바꾸고 P7 READY를 연다.

STOP CONDITION: 변경창 전에는 외부 변경 없이 preflight 상태로 대기한다. 22:00 cutoff 실패·보호 서비스 변화·Secret 노출·동일 실패 3회면 rollback 후 중단한다. 모든 G4 증거와 서명 3/3이 PASS하면 P6를 완료하고 P7-G0로 이동한다.
