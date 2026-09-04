# PE-C1 Excel 원장 안전 이관 체크리스트

기준일: 2026-09-04 KST

상태: **증거 있는 완료**

다음 READY: `PE-C2-QR-ASSET-IDENTITY-AND-LABEL`

## 1. 사용자 가치

- [x] Excel 원장을 한국어 템플릿으로 옮길 수 있다.
- [x] 등록 전에 정상·오류 건수와 행별 수정 사유를 확인한다.
- [x] 오류 행이 있으면 일부 자산만 등록되지 않는다.
- [x] 격리 PostgreSQL과 합성 MANAGER 로그인 브라우저에서 직원 업무 흐름을 검증했다.

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
- [x] 실제 PostgreSQL HTTP 통합에서 `asset.create` 쓰기 경로를 재검증하고 ADMIN/USER 허용·거부 분기는 단위·route 계약 12/12로 보존했다.

## 4. 화면·접근성

- [x] 템플릿 → 파일 선택 → 미리보기 → 명시적 확정 3단계 UX
- [x] 총계·등록 가능·수정 필요와 최대 100행 결과 표시
- [x] label, 오류 텍스트, `aria-live` 결과 영역
- [x] 900px 이하 단일 열 계약
- [x] Chrome 1440×900과 390×844 실제 렌더·캡처, 가로 넘침 0, 모바일 헤더 표시

## 5. 데이터·운영

- [x] DB schema migration 없이 기존 자산·이력·감사·outbox 계약 재사용
- [x] advisory transaction lock과 중복키 충돌 rollback
- [x] 기존 Production·P7·Docker 3서비스·보호 포트 변경 없음
- [x] 오류 미리보기 DB 변경 0, 성공 등록·감사 확인 뒤 합성 자산과 세션·멱등키를 정리했다.

## 6. 검증 증거

- [x] 메타프롬프트 strict: 8/8 PASS
- [x] UI 계약: 30/30 PASS
- [x] 저장소 JavaScript 구문: 435 files PASS
- [x] 단위시험: 927 PASS / 8 SKIP / 0 FAIL
- [x] 실제 PostgreSQL HTTP 통합: 1 PASS / 0 FAIL
- [x] 격리 3컨테이너 조합: frontend HTTP 200, backend health HTTP 200·healthy, PostgreSQL healthy
- [x] 브라우저 자동화: 1440×900·390×844 PASS, 두 뷰포트 모두 horizontal overflow 없음

재개 결과: Docker Engine 29.6.1 복구 후 격리 backend·PostgreSQL과 bind-mounted Nginx frontend를 동일 시험 네트워크에 연결했다. 실제 HTTP 통합은 템플릿, 오류 0-write, 정상 preview, checksum 확정, replay, 변조 거부, 이력·감사와 cleanup을 통과했다. Chrome DevTools 실행기로 1440×900·390×844를 캡처했고 모바일에서 발견한 제목/메뉴 중첩과 누락된 `.sr-only` 스타일을 수정한 뒤 재검증했다.

브라우저 원본은 저장소 밖 `D:\seowon_runtime\sqcm-i-inventory-c1\evidence\browser-final-v3`에 보존한다. desktop SHA-256은 `0238bd081964706d0ef50e6c0f252dcfdfdb8c603630c95d5cdc7a2a6680b3ff`, mobile SHA-256은 `8c70384dd306288220460a74a12f29204cde662ec0e2060d5c71c712c07ec0e0`이다.

## 7. 인도·복구

- [x] 변경 범위와 다음 READY를 로드맵·현재 상태에 같은 사실로 기록
- [x] C1 완료 체크포인트 commit·push: `14fdcb813d9504618a9e6eaf12c0d8b82b205a4c`
- [x] 미완료 변경의 `WIP recovery checkpoint` `0dde2b5e8be5b33bd1608d00389455c2d3ff37b9` push
- [x] WIP checkpoint local/remote SHA 일치

모든 C1 기능·보안·데이터·화면 증거가 PASS했고 exact allowlist 완료 commit을 원격 동일 branch에 push했다. local/remote SHA 일치를 확인했으므로 C1을 닫고 `PE-C2-QR-ASSET-IDENTITY-AND-LABEL`을 연다.

## 변경 파일 범위

- 서비스/API: `src/services/asset-import-service.js`, `src/enterprise-routes.js`, `src/idempotency.js`
- 화면: `frontend/app.js`, `frontend/experience.css`, `frontend/index.html`
- 검증: `test/unit/asset-import-service.test.js`, `test/unit/asset-import-route.test.js`, `test/integration/http-smoke.test.js`, `scripts/run-asset-import-integration.mjs`, `scripts/c1-browser-evidence.mjs`, `scripts/ui-contract-check.mjs`, `package.json`
- 계약/설계/증거: `agent docs/prompts/100_Product_Enhancement_Excel_Import_Meta_Prompt.md`, `agent docs/harness/PE_C1_EXCEL_IMPORT_EVIDENCE.json`, `develop docs/34_SQCM-i_C_제품고도화_로드맵.md`, 이 문서, `docs/current-state.md`, `docs/roadmap.md`
