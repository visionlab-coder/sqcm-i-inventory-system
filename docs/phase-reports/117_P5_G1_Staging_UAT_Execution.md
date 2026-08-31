# P5-G1 Staging UAT 실행 보고

기준일: 2026-08-31

## 결과

P5-G1은 **차단**이다. 합성 fixture로 19개 중 5개 PASS, 1개 FAIL, 13개 NOT RUN까지 실제 staging에서 확인했다. `P5-DEFECT-001` High가 열려 있으므로 P5-G2 서명과 Production은 NO-GO다.

## 체크리스트

- [x] staging HTTPS health/readiness 200
- [x] ADMIN·MANAGER·USER OIDC 세션과 정확한 역할
- [x] Secret 비출력·보호 파일 경계 유지
- [x] USER 부서 scope와 타 부서 403
- [x] 합성 runId fixture와 request ID 추적
- [ ] 정상 PNG 증빙 업로드·다운로드 — HTTP 500
- [ ] 배정·반납·구매·수리·실사·CSV
- [ ] infected·unknown·timeout과 provider receipt
- [ ] MFA·세션 생애주기 완료
- [ ] 인증된 모바일 브라우저 관찰
- [x] Docker 3서비스 healthy
- [x] 보호 listener 5개 PID 보존
- [x] commit·push·Production 변경 없음

## 결함 P5-DEFECT-001

- 심각도/상태: `HIGH / OPEN`
- 재현: 유효한 PNG를 staging `POST /api/enterprise/assets/1/files`로 업로드한다.
- 기대: HTTP 201, Supabase Storage 저장, `file_records` 생성, 다운로드 일치.
- 실제: HTTP 500, PostgreSQL `23514`, `ck_file_records_storage_driver` 위반.
- 원인: migration 008의 허용값은 `LOCAL|EXTERNAL`이나 live adapter는 `SUPABASE_S3`를 기록한다.
- 영향: 자산 증빙과 반납 사진 경로가 막혀 UAT 핵심 흐름을 닫을 수 없다.
- 최소 보완 후보: 새 migration으로 명시적 adapter driver를 허용하거나, 애플리케이션의 DB 저장 분류를 기존 `EXTERNAL` 계약으로 정규화한다. 적용 전 migration·호환성·rollback 검증이 필요하다.

## 실행·보존 증거

- 실행기: `scripts/staging-uat-execution.mjs`
- 기계 증거: `agent docs/harness/P5_G1_STAGING_UAT_EXECUTION_EVIDENCE.json`
- 성공: P5-UAT-01, 02, 03, 04, 07
- 실패: P5-UAT-08
- 미실행: P5-UAT-05, 06, 09~19
- 마지막 실행의 MFA 변경은 원복됐고 staging frontend/backend/database는 모두 healthy다.
- 보호 listener는 `1234/6632`, `11434/8588`, `18765/22716`, `18766/65724`, `18767/28532`로 유지됐다.

## 다음 Gate

다음 READY는 `P5-G1-STAGING-UAT-REMEDIATION`이다. High 결함을 최소 수정하고 staging에만 적용·재검증한 뒤, 동일 실행기로 남은 시나리오를 수행해야 한다. 브라우저 자격증명 입력 직전에는 별도 확인이 필요하다.
