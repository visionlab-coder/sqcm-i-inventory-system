# P6-G1 OCI 계정·서울 홈 리전·과금 방지 결과

기준일: 2026-09-01

결과: **가입 화면 준비 / 무료 전용 경계 확정 / HOLD_USER_IDENTITY_AND_PAYMENT_VERIFICATION / Production NO-GO**

## 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| PostgreSQL 라이선스 | ✅ 무료 | PostgreSQL 16 오픈소스 사용에 카드·사용료 불필요 |
| OCI 가입 화면 | ✅ 준비 | `signup.cloud.oracle.com`, 비필수 쿠키 거절 |
| 신원정보 | ⏸ 사용자 직접 입력 | 국가·법적 이름·실사용 이메일·주소·전화 필요 |
| 카드 확인 | ⏸ 사용자 직접 입력 | OCI 무료 계정의 신원·부정사용 방지 확인이며 PostgreSQL 비용이 아님 |
| 서울 홈 리전 | ⏸ 가입 후 선택 | `ap-seoul-1`; tenancy 생성 후 변경 불가 |
| 무료 VM 기준 | ✅ 경계 확정 | Free-only A1 총 2 OCPU·12GB, boot volume 100GB 목표 |
| 유료 전환·Add-on | ⛔ 금지 | Pay As You Go·유료 리소스·초과 사용 승인 없음 |
| OCI tenancy·VM·IP·runner | ☐ 미생성 | 개인정보·결제 확인 전 외부 생성 없음 |

## 판정

PostgreSQL은 무료 오픈소스이므로 결제수단이 필요하지 않다. 카드 요구 주체는 PostgreSQL이 아니라 OCI이며 무료 클라우드 계정의 본인확인과 부정 가입 방지를 위해 사용한다. Oracle은 소액 임시 승인 보류가 발생할 수 있으나 사용자가 유료 전환을 선택하지 않으면 서비스 요금으로 청구하지 않는다고 안내한다.

무료 전용 결정을 우선해 VM 후보를 A1 총 2 OCPU·12GB·100GB로 제한한다. 4 OCPU·24GB는 Free-only 계정 한도가 아니므로 현재 Production 사양으로 확정하지 않는다. Pay As You Go, 유료 Add-on과 과금 가능 리소스는 모두 금지한다.

가입 페이지는 열려 있고 비필수 쿠키를 거절했다. 현재 국가·법적 이름·실사용 이메일 단계이며 이후 주소·전화·카드 확인과 서울 홈 리전 선택이 필요하다. 개인정보와 결제정보는 문서나 로그에 남기지 않으며 사용자가 화면에서 직접 입력해야 한다.

## 공식 근거

- Oracle Cloud Free Tier FAQ: https://www.oracle.com/asean/cloud/free/faq/
- Sign Up for the Free Oracle Cloud Promotion: https://docs.oracle.com/en-us/iaas/Content/GSG/Tasks/signingup_topic-Sign_Up_for_Free_Oracle_Cloud_Promotion.htm
- Always Free Resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Managing Regions: https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingregions.htm

다음 READY는 동일한 `P6-G1-OCI-ACCOUNT-SEOUL-HOME-REGION-AND-BILLING-GUARD`다. 사용자가 OCI 화면에서 신원·이메일·결제 확인을 완료하고 홈 리전을 `ap-seoul-1`로 선택한 실제 증거가 생길 때까지 VM 생성으로 이동하지 않는다.
