# P6-G1 OCI 무료 VM 후보·ARM64 릴리스 결과

기준일: 2026-09-01

결과: **OCI SEOUL 후보 선정 / ARM64 로컬 계약 PASS / HOLD_OCI_ACCOUNT_AND_BILLING_GUARD / Production NO-GO**

## 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| 공급자·리전 | ✅ 후보 선정 | OCI South Korea Central `ap-seoul-1` |
| VM 사양 | ✅ 설계 | Ampere A1 4 OCPU·24GB·100GB, Ubuntu 24.04 ARM64 |
| 비용 0 목표 | ◐ 조건부 | 가격표상 월 3,000 OCPU-hour·18,000 GB-hour 무료 범위 안이지만 초과 과금 통제가 필요 |
| Free-only 계정 | ⛔ 사양 미달 | 현재 공식 Always Free 문서는 2 OCPU·12GB로 제한 |
| 고정 주소 | ☐ 미생성 | OCI reserved public IP 기능은 확인, 실제 값 없음 |
| ARM64 이미지 | ✅ 로컬 계약 | backend/frontend를 `linux/amd64,linux/arm64`로 게시하도록 workflow 보완 |
| 원격 이미지 manifest | ☐ NOT RUN | commit·push·Actions를 실행하지 않음 |
| 전용 runner | ☐ 미등록 | outbound HTTPS 443·Linux Docker 요구 확인, 실제 OCI VM 없음 |
| PostgreSQL PITR | ☐ HOLD | WAL off-site 대상·RPO·RTO 미확정 |

## 판정

기존 승인 사양 4 vCPU·8GB 이상을 서울 리전에서 비용 0 목표로 맞추는 후보는 OCI Ampere A1이다. 4 OCPU·24GB를 한 달 사용하면 공개 가격표의 첫 3,000 OCPU-hour와 18,000 GB-hour 범위 안에 들어간다. 그러나 Free-only tenancy 문서의 제한은 2 OCPU·12GB이며, 4 OCPU 구성에는 Pay-As-You-Go 계정 또는 동등한 계정 상태와 초과 사용 통제가 필요하다. Always Free 인스턴스에는 용량 부족과 idle reclaim 위험도 있다.

OCI A1은 ARM64이므로 기존 amd64 전용 릴리스 가능성을 그대로 두지 않았다. GitHub-hosted release workflow에 SHA 고정 QEMU와 backend/frontend `linux/amd64,linux/arm64` 플랫폼을 추가했고 단위 계약으로 두 이미지 모두를 검사한다. 원격 Actions와 실제 manifest는 아직 실행하지 않았다.

로컬 검증은 구문 126, 단위 148/148, application migration 25/25, PostgreSQL BLOB 계약, Compose 3서비스, UI 계약 20, Harness verify와 repository hygiene까지 모두 PASS다.

로컬 PC에는 OCI CLI, `~/.oci/config`, Terraform이 모두 없다. 따라서 다음 READY는 `P6-G1-OCI-ACCOUNT-SEOUL-HOME-REGION-AND-BILLING-GUARD`다. OCI tenancy·Seoul home region·결제 보호 조건이 실제로 확인되기 전에는 VM·고정 IP·runner를 생성하지 않는다.

## 공식 근거

- Oracle Always Free Resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Oracle OCI Global Price List: https://www.oracle.com/ae/a/ocom/docs/corporate/pricing/oracle-paas-and-iaas-global-price-list.pdf
- OCI Regions: https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm
- GitHub self-hosted runners: https://docs.github.com/en/actions/reference/runners/self-hosted-runners
- PostgreSQL 16 PITR: https://www.postgresql.org/docs/16/continuous-archiving.html
