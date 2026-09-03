# P6-G1 OCI 무료 VM 후보·ARM64 릴리스 실행계약

기준일: 2026-09-01

ROLE: 무료 비용 목표와 Production 신뢰 경계를 함께 보존하는 배포 인프라 관리자다.

GOAL: 서울 전용 VM 후보를 공식 가격·리전·runner·복구 기준으로 확정하고, ARM64 후보가 현재 릴리스 이미지를 실행할 수 있도록 다중 아키텍처 이미지 계약을 로컬에서 검증한다.

SCOPE:
- OCI Seoul `ap-seoul-1`, Ampere A1 4 OCPU·24GB·100GB 후보 조사
- 월 무료 OCPU·메모리·block storage 한도와 과금 위험 분리
- GitHub self-hosted runner outbound HTTPS·Docker 요구사항
- backend/frontend GHCR 이미지의 `linux/amd64,linux/arm64` 게시 계약
- PostgreSQL 16 backup/WAL RPO·RTO의 다음 외부 입력 식별

OUT OF SCOPE:
- OCI 계정·tenancy·VM·VCN·고정 IP 생성, 결제수단·Secret 입력
- Git commit·push·PR·Actions 실행과 이미지 게시
- Production DNS/TLS·migration·배포·WAL 활성화
- Supabase staging과 보호 서비스 변경

INPUTS / SOURCE OF TRUTH:
1. 사용자 무료 운영·PostgreSQL 전환 결정과 승인된 VM 최소 사양
2. Oracle 공식 Always Free·가격표·리전·공인 IP 문서
3. GitHub 공식 self-hosted runner 문서와 PostgreSQL 16 PITR 문서
4. 실제 release workflow·Dockerfile·Compose·Harness 상태

WORKFLOW: Harness 검사 → 공식 공급자 비교 → 비용·용량·아키텍처 판정 → ARM64 릴리스 최소 변경 → 단위·Harness 검증 → 외부 계정 Gate 기록

AUTHORITY / PERMISSIONS:
- 공식 자료와 로컬 상태 읽기, workflow·테스트·Agent Docs·Harness 최소 수정은 허용한다.
- OCI/GitHub 외부 리소스 생성, 결제, Secret, push·CI·배포는 실행하지 않는다.

CONSTRAINTS:
- Docker 서비스는 `frontend`, `backend`, `database` 정확히 3개를 유지한다.
- amd64 staging과 arm64 Production 후보를 모두 지원하되 실제 manifest 전에는 배포 가능으로 승격하지 않는다.
- 월 비용 0은 공개 무료 사용량 한도 안이라는 조건부 추정이며 실제 invoice·quota 증거를 대신하지 않는다.

SUCCESS CRITERIA:
- 서울 리전과 승인 사양을 만족하는 비용 0 목표 후보와 초과 과금 조건이 명확하다.
- 두 릴리스 이미지가 amd64와 arm64 manifest를 생성하도록 workflow 계약이 검증된다.
- runner·backup·WAL의 외부 선행조건이 추정이 아닌 명시 상태로 기록된다.

FAILURE CRITERIA:
- Free-only 2 OCPU 한도를 승인 사양 4 OCPU로 오인한다.
- ARM64 VM에 amd64 전용 이미지를 배포 가능으로 판정한다.
- 계정·결제수단·고정 IP·WAL 저장소가 없는데 실제 provisioning 완료로 기록한다.

VERIFICATION / EVIDENCE:
- Oracle·GitHub·PostgreSQL 공식 문서 URL과 조회일
- `npm.cmd run check`, `npm.cmd run harness:check`, `npm.cmd run harness:verify`
- release workflow의 pinned QEMU action, 두 `platforms` 계약과 `git diff --check`
- 로컬 OCI CLI·config·Terraform 존재 여부 읽기 확인

OUTPUTS / FORMAT:
- `agent docs/harness/P6_G1_OCI_FREE_VM_PROVIDER_EVIDENCE.json`
- `docs/phase-reports/123_P6_G1_OCI_Free_VM_Provider_And_ARM64_Release.md`
- 현재 상태·로드맵·Harness의 동일 READY 상태

STOP CONDITION:
- OCI 계정·Seoul home region·Pay-As-You-Go 무료 사용량 보호 동의가 없으면 외부 생성 없이 `HOLD_OCI_ACCOUNT_AND_BILLING_GUARD`로 중단한다.
