# P6-G1 Production Target·Provider Input 결과

> 2026-09-01 후속 사용자 결정으로 유료 Supabase Production project 경로는 폐기되었다. 현재 판정은 `122_P6_G1_Free_PostgreSQL_Production_Architecture.md`를 따른다.

기준일: 2026-09-01

결과: **HOLD_SUPABASE_FREE_PROJECT_LIMIT / Production NO-GO / 6/8 Phase 완료 유지**

## 체크리스트

| 입력 | 상태 | 실제 증거 |
|---|---|---|
| release candidate | ✅ 고정 | `codex/fix-sidebar-accessibility`의 `0d892f0b…`가 원격 ref와 일치하고 작업트리가 clean |
| current SHA PR·CI | ☐ HOLD | open PR 0, `0d892f0b…` Actions run 0. 과거 성공 run은 이전 SHA `dfc37e3b…` |
| Production hostname | ✅ 승인 | `inventory.safe-link.co.kr`; Cloudflare DNS/TLS 게시는 아직 실행 안 됨 |
| Supabase 조직 | ✅ 확인 | `sqcm-i-inventory` (`ycuakon…`), 현재 Free plan |
| staging 분리 | ✅ 확인 | `iuoljos…`, Singapore, `ACTIVE_HEALTHY`; Production 재사용 금지 |
| Production project | ⛔ 한도 차단 | USD 0/month 확인·승인 후 Seoul 생성을 1회 요청했으나 활성 Free 프로젝트 2개 한도로 거부됨. 프로젝트·비용 발생 0 |
| Production region | ✅ 승인 | Seoul `ap-northeast-2` |
| backup/PITR | ☐ HOLD | Free plan을 Production 복구 증거로 승격하지 않음. plan·retention·RPO/RTO·비용 결정 필요 |
| runtime·runner | ◐ 사양 승인 | `sqcm-i-inventory-prod-01`, Ubuntu 24.04, 4 vCPU, 8 GB, 100 GB SSD 승인. 공급자·주소·비용과 실제 runner는 미확정 |
| 변경 시간·책임자 | ✅ 승인 | 2026-09-11 20:00~23:00 KST, 22:00 rollback cutoff, 현재 사용자 실행·rollback 책임 |

불변식 재확인 결과 staging `frontend/backend/database`는 3/3 healthy이고 LM Studio `1234/PID 6632`, Ollama `11434/PID 8588`, bridge/wslrelay `18765/PID 22716` listener가 그대로 유지됐다.

## 공급자 사전검토

판정은 **ALLOW_WITH_CONDITIONS**다. Supabase 연결과 staging 프로젝트는 정상이나, Production은 별도 project·OIDC·Storage·Secret reference로 분리해야 한다. 공식 changelog의 backup scheduling 수정, Management API logs endpoint 변경, extension version pin 무시, Free tier Auth email template 변경, 신규 table Data API 비자동 공개를 검토했다. 저장소 SQL에서 extension version pin과 `anon`/`authenticated` 직접 grant는 발견되지 않았다.

Supabase 공식 문서상 관리형 daily backup은 Pro/Team/Enterprise plan에 제공되고 PITR은 유료 add-on이며, Storage object는 DB backup에 포함되지 않는다. 따라서 현재 Free plan과 USD 0 project quote는 Production backup 수용 기준이 아니다.

## 현재 판정

2026-09-01 10:02 KST에 승인된 `sqcm-i-inventory-production`·Seoul project 생성을 1회 요청했다. Supabase가 조직 Owner/Admin의 활성 Free project 2개 한도 도달을 반환해 생성되지 않았다. 동일 요청은 재시도하지 않았고 다른 프로젝트 pause·delete·transfer·plan upgrade도 실행하지 않았다.

공식 정책상 Free plan은 Owner/Admin 전체 조직을 합쳐 활성 project 2개 한도이며 paused project는 한도에서 제외된다. 현재 가격은 Pro가 월 USD 25부터이고 첫 project 이후 추가 project는 월 USD 10부터다. `sqcm-i-inventory` 조직에서 staging과 Production 두 project를 운영하는 권장 최소 추정은 월 USD 35부터이며, PITR 7일은 별도 월 USD 100이다. 실제 세금·초과 사용·VM 비용은 포함하지 않는다.

G0의 “staging 후보 미커밋” 공백은 해소됐다. 후보는 정확한 SHA로 commit·push됐지만 PR·current SHA CI·main 이미지 digest가 없으므로 P6-G2는 아직 시작할 수 없다. Production project 생성, DNS/TLS, Secret, migration, 배포는 실행하지 않았다.

다음 READY는 그대로 `P6-G1-PRODUCTION-TARGET-CHANGE-WINDOW-AND-PROVIDER-INPUT`이다. 권장은 기존 활성 project를 건드리지 않고 `sqcm-i-inventory` 조직을 Pro로 전환한 뒤 Production project 생성을 다시 수행하는 것이다. 유료 전환 승인 전에는 변경하지 않는다.
