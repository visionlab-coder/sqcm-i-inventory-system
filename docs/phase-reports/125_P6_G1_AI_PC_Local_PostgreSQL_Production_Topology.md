# P6-G1 AI PC 로컬 PostgreSQL Production 토폴로지 결과

기준일: 2026-09-01

결과: **OCI 경로 폐기 / AI PC 격리 토폴로지 계약 PASS / 실제 Production 미배포 / Production NO-GO**

## 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| OCI·결제 경로 | ✅ 폐기 | 사용자 `OCI 폐기, AI PC PostgreSQL 운영 승인` |
| PostgreSQL | ✅ 계약 | Docker PostgreSQL 16, application migration 25/25 |
| Production project | ✅ 격리 설계 | `seowon-inventory-production` |
| Docker 서비스 | ✅ 3개 | frontend/backend/database |
| frontend 포트 | ✅ loopback | `127.0.0.1:3300` |
| backend/database | ✅ 비공개 | 호스트 port 0 |
| 자원 상한 | ✅ 계약 | 총 4.5 CPU·4.25GB memory 이하 |
| 기존 서비스 | ✅ 보존 | local·staging·S-FRAME·Hermes, 보호 PID 3개 |
| Production Secret | ☐ 미생성 | 별도 Secret 승인·주입 Gate 필요 |
| 불변 이미지·CI | ☐ NOT RUN | 로컬 변경 미커밋, 원격 CI·digest 없음 |
| migration·배포·DNS/TLS | ☐ NOT RUN | 실제 Production 변경 없음 |

검증 결과는 구문 128개, 단위 149/149, application migration 25/25, AI PC Production 계약, Compose 3서비스, UI 계약 20개, staging 3서비스 health와 Harness verify가 모두 PASS다.

## 판정

PostgreSQL 자체에는 결제수단이 필요하지 않으며 OCI 계정 경로는 폐기한다. AI PC를 Production 호스트로 사용하되 기존 local·staging과 이름·볼륨·네트워크를 분리하고 frontend는 다음 TLS 게시 Gate 전까지 `127.0.0.1:3300`에만 바인딩한다. backend와 database는 호스트에 공개하지 않는다.

AI PC는 24 logical CPU, RAM 약 64GB, D: 여유 약 1.81TB지만 관찰 시 여유 RAM은 약 12GB이고 SQCM-i·S-FRAME·비품관리 local/staging 컨테이너가 함께 실행 중이다. Production 세 서비스 합계 상한을 4.5 CPU·4.25GB로 제한했지만 단일 호스트 장애와 자원 경합 위험은 남는다.

이번 Loop에서는 실행 중 컨테이너·볼륨·포트·방화벽·Secret·Git 원격을 변경하지 않았다. 다음 READY는 정확한 변경분을 commit/push하고 GitHub-hosted CI에서 불변 amd64 이미지를 생성·검증하는 `P6-G2-RELEASE-CANDIDATE-GIT-CI-AND-IMMUTABLE-IMAGES`다.
