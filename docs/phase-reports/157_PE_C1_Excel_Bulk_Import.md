# PE-C1 Excel 원장 안전 이관 체크리스트

기준일: 2026-09-04 KST

상태: **진행 중 / 복구 지점 차단**

현재 READY: `PE-C1-REAL-POSTGRES-INTEGRATION-AND-BROWSER-EVIDENCE`

## 1. 사용자 가치

- [x] Excel 원장을 한국어 템플릿으로 옮길 수 있다.
- [x] 등록 전에 정상·오류 건수와 행별 수정 사유를 확인한다.
- [x] 오류 행이 있으면 일부 자산만 등록되지 않는다.
- [ ] 실제 PostgreSQL과 브라우저에서 직원 업무 흐름을 검증한다. (`NOT_RUN_REBOOT_CHECKPOINT`)

## 2. 기능

- [x] UTF-8 BOM CSV 템플릿과 가상 예시
- [x] 최대 500행·512KiB 상한
- [x] 한국어/영문 헤더, 날짜·금액·상태·기준코드 검증
- [x] 파일 내부 및 기존 원장 자산번호·제조번호 중복 검출
- [x] checksum 기반 미리보기/확정 결박
- [x] 자산·상태이력·감사·outbox 원자적 기록

## 3. 보안·권한

- [x] `asset.create` 권한과 조직·부서 scope 재검사
- [x] CSRF와 Idempotency-Key 적용
- [x] CSV 입력 수식 차단, CSV 내보내기 수식 중화
- [x] Secret·토큰·개인정보 원문을 템플릿·증거에 기록하지 않음
- [ ] 실제 ADMIN 허용·USER 403을 PostgreSQL HTTP에서 재검증한다.

## 4. 화면·접근성

- [x] 템플릿 → 파일 선택 → 미리보기 → 명시적 확정 3단계 UX
- [x] 총계·등록 가능·수정 필요와 최대 100행 결과 표시
- [x] label, 오류 텍스트, `aria-live` 결과 영역
- [x] 900px 이하 단일 열 계약
- [ ] 1440px 데스크톱과 390×844 모바일 실제 브라우저 캡처

## 5. 데이터·운영

- [x] DB schema migration 없이 기존 자산·이력·감사·outbox 계약 재사용
- [x] advisory transaction lock과 중복키 충돌 rollback
- [x] 기존 Production·P7·Docker 3서비스·보호 포트 변경 없음
- [ ] 실제 DB rollback 후 row count 불변 증거

## 6. 검증 증거

- [x] 메타프롬프트 strict: 8/8 PASS
- [x] UI 계약: 28/28 PASS
- [x] 저장소 JavaScript 구문: 435 files PASS
- [x] 단위시험: 927 PASS / 8 SKIP / 0 FAIL
- [ ] 실제 PostgreSQL HTTP 통합: `NOT_RUN_REBOOT_CHECKPOINT`
- [ ] Docker health·smoke: `PARTIAL_BUILD_INTERRUPTED_BEFORE_RUNTIME`

재개 증거: 이전 실행에서는 임시 backend가 `server_start_failed`와 `AggregateError`로 종료되고 Docker CLI가 응답하지 않았다. 2026-09-04 재확인에서는 Docker Engine 29.6.1이 응답했고 격리 Compose build가 backend 이미지 완료, frontend `npm ci` 단계까지 진행됐다. 시스템 재부팅 전 안전 저장 요청을 받아 실제 컨테이너 기동·통합시험 전에 전경 빌드 셸을 중단했다. 이후 정정 지침에 따라 추가 프로세스 종료는 수행하지 않았다.

## 7. 인도·복구

- [x] 변경 범위와 다음 READY를 로드맵·현재 상태에 같은 사실로 기록
- [ ] C1 완료 체크포인트 commit·push
- [ ] 현재 미완료 변경의 `WIP recovery checkpoint` commit·push
- [ ] local/remote SHA 일치 증거

실제 통합·브라우저 증거가 없으므로 C1 완료나 C2 시작으로 승격하지 않는다. 재부팅 후 Docker 상태와 격리 프로젝트를 먼저 읽기 확인하고, 새 임시 환경에서 통합시험을 재개한다.

## 변경 파일 범위

- 서비스/API: `src/services/asset-import-service.js`, `src/enterprise-routes.js`, `src/idempotency.js`
- 화면: `frontend/app.js`, `frontend/experience.css`, `frontend/index.html`
- 검증: `test/unit/asset-import-service.test.js`, `test/unit/asset-import-route.test.js`, `test/integration/http-smoke.test.js`, `scripts/run-asset-import-integration.mjs`, `scripts/ui-contract-check.mjs`, `package.json`
- 계약/설계/증거: `agent docs/prompts/100_Product_Enhancement_Excel_Import_Meta_Prompt.md`, `agent docs/harness/PE_C1_EXCEL_IMPORT_EVIDENCE.json`, `develop docs/34_SQCM-i_C_제품고도화_로드맵.md`, 이 문서, `docs/current-state.md`, `docs/roadmap.md`
