# P4-G1 Backup·Migration·Live Deployment 연결 결과

기준일: 2026-08-31

결과: **PASS / off-site backup 별도 미완료 / P4 계속 진행**

## 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| live staging 대상 | [x] | `inventory-staging.safe-link.co.kr`, Supabase `iuol…` |
| application verifier | [x] | migration `supabase` 24/24 |
| provider history | [x] | `sqcmi_001`~`sqcmi_024` 정확히 24개 |
| backup 파일 | [x] | 471,726 bytes |
| backup SHA-256 | [x] | manifest와 재계산 일치 |
| 복구 대조 | [x] | 52 tables·40 rows·3 functions 일치 |
| 임시 복구 자원 | [x] | 제거됨 |
| rollback 자산 | [x] 보존 | synthetic·candidate 정지 컨테이너 6개 |
| off-site copy | [ ] 외부 게이트 | 저장소·전송 승인 미확정 |

새 migration이나 DB write는 실행하지 않았다. 기존 검증된 backup과 migration history를 현재 live deployment에 연결했으며 Secret 원문은 출력하지 않았다.

다음 READY는 `P4-G2-STAGING-HEALTH-SMOKE-ROLLBACK`이다. health/readiness·핵심 smoke·5xx 로그를 확인한 뒤 보존된 synthetic으로 실제 rollback과 live non-seed 재전진을 검증한다. off-site backup은 P4 종료 전 외부 게이트로 남긴다.
