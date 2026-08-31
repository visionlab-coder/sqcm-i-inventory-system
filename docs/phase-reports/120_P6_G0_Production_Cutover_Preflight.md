# P6-G0 Production Cutover Preflight 결과

기준일: 2026-08-31

결과: **HOLD_EXTERNAL_INPUTS / Production NO-GO / 6/8 Phase 완료 유지**

## 코드→운영 8단계 판정

| 단계 | 판정 | 실제 증거 |
|---|---|---|
| 1 릴리스 기준선 | HOLD | HEAD `dfc37e3…`, tracked 변경 30·untracked 144로 현재 staging 후보 미고정 |
| 2 로컬 품질 | PASS_STAGING | P5 UAT 19/19·Critical/High 0·서명 3/3 |
| 3 불변 이미지 | HOLD | P2 main `79a1292…` 이미지 digest는 있으나 P3~P5 변경을 포함하지 않음 |
| 4 GitHub-hosted CI | HOLD | `79a1292…`만 green; 현재 후보 원격 CI 없음 |
| 5 배포 승인 | HOLD | Production target·변경 시간·릴리스·cutover 승인 없음 |
| 6 전용 runner | HOLD | self-hosted Production workflow 0 |
| 7 운영 배포·복귀 | HOLD | 실제 Production manifest 0, cutover evidence 0 |
| 8 운영 인계 | HOLD | 운영 backup/PITR·관측·온콜·복구 인수 미완료 |

## Fail-closed 증거

- example operations manifest는 `template manifest cannot authorize deployment`로 차단됐다.
- example cutover evidence는 template 차단과 12개 Gate·3개 승인·역할별 UAT 증거 누락을 모두 보고했다.
- staging HTTP 200과 P5 서명을 Production 승인으로 승격하지 않았다.

## 필요한 외부 입력

- 비품관리 전용 Production hostname과 DNS/TLS 책임자
- staging과 분리된 Production Supabase project, 공급자·Secret reference
- 현재 staging 변경을 포함할 release candidate 범위와 이후 commit/push/main CI·신규 image digest 승인
- Production 변경 시간과 실행 책임자
- 전용 deployment runner 또는 승인된 대안
- Production backup/PITR/RPO/RTO·monitoring·alert·rollback 책임자

현재 `sqcm.safe-link.co.kr`은 기존 SQCM-i OS가 사용 중이므로 비품관리 Production 증거로 사용할 수 없다. 권장 hostname은 충돌을 피한 `inventory.safe-link.co.kr`이며, 실제 생성·DNS 게시 전 사용자의 대상 승인이 필요하다.

다음 READY는 `P6-G1-PRODUCTION-TARGET-CHANGE-WINDOW-AND-PROVIDER-INPUT`이다. 외부 입력이 정해질 때까지 commit·push·Production 변경은 실행하지 않는다.
