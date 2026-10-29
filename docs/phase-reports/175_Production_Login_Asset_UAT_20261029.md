# 실제 로그인·시험 자산 등록·수정·조회 검증

2026-10-29 KST. **운영 API·DB의 로그인/등록/상태수정/조회 PASS, 일반 기본정보 수정은 미구현**. 전체 제품·모든 수정 기능의 정상 완료 선언은 아니다.

## 승인·보존 범위

사용자가 시험용 자산만 사용하고 기존 직원 계정·실제 데이터를 변경하지 말라고 지정했다. 보호된 기존 UAT ADMIN credential reference를 메모리에서만 읽었고 회사 직원 계정은 사용하지 않았다. 직원이 열어 둔 브라우저 로그인 세션도 유지하기 위해 별도 HTTP cookie jar로 검증했다. 자격증명·TOTP·쿠키·CSRF·개인 명부 원문은 출력·기록하지 않았다.

운영 backend source revision은 `1e0f9145e1f4e93f9d7b7485319a33815c159321`, frontend는 `63aed8b6a58bbb00e1359fc81d1d6f7c214a7e2b`다. HEAD `3fdfdd0965bb77b5f11b97a25b10c62ad2fb9c22`와 backend 기준선의 enterprise-routes·enterprise-service·frontend/app.js diff0을 확인했다. 제품 코드·DB 스키마·계정·서비스·터널·배포 설정은 변경하지 않았다.

## 체크리스트·실제 결과

| 검증 | 실제 관찰 | 판정 |
|---|---|---|
| 시험계정·취소 정책 preflight | 기존 ACTIVE UAT ADMIN, 초기 비밀번호 변경불필요, 기존 CANCELLED 정책/사유 존재 | PASS |
| 비로그인 자산 조회 | HTTP401 | PASS |
| 비밀번호 로그인 | HTTP202, 기존 MFA 요구 | PASS |
| 기존 MFA 및 본인 세션 | MFA200, `/api/auth/me`200·시험 actor 일치 | PASS |
| 시험 자산 등록 | POST `/api/enterprise/assets`201·DRAFT·고유 표식/actor/조직 일치 | PASS |
| 최초 상세 재조회 | GET `/api/enterprise/assets/8`200·명칭/DRAFT 일치 | PASS |
| 지원되는 상태 수정 | POST `/api/enterprise/assets/8/status`200·CANCELLED | PASS |
| 검색·수정 후 상세 | 고유 표식 검색200·정확히1개, 상세200·CANCELLED·상태이력2 | PASS |
| DB·감사 대조 | 시험 자산1·비활성·취득가0·배정0·상태이력2·감사2 | PASS |
| 로그아웃·이전 세션 거부 | POST logout204, 기존 시험 cookie로 me401 | PASS |
| 직원 계정·권한 보존 | 회사13계정·권한13건, 모든 컬럼 전후 fingerprint 동일 | PASS |
| 기존 업무 데이터 보존 | 시험 자산을 제외한17개 실제 존재 업무 테이블 count/fingerprint 동일 | PASS |
| 자산명·일련번호·위치 등 일반 수정 | 상세 화면은 상태전환만 제공, 일반 필드 저장 UI/API 없음 | 미구현 |
| 브라우저 전체 입력 흐름 | 기존 직원 세션을 변경하지 않기 위해 수행하지 않음 | NOT_RUN |

보존 비교에는 assets·asset_assignments·items·loans·workflow_requests·purchase_orders·receipts·inspections·asset_files·stocktakes·item_categories·item_models·locations·departments·organizations·asset_status_definitions·asset_reason_definitions를 포함한다. 인증 시험으로 기존 시험계정의 last-login/세션 기록, 시험 자산의 감사·상태이력·outbox 기록이 추가되는 것은 예상된 시험 범위다. 이를 직원 계정 또는 실제 업무 데이터 변경과 혼동하지 않는다.

## 시험 자산 정리

- 표식: `UAT-20261029-LOGIN-ASSET-01`, ID8.
- 이름: `[시험용·실물아님] 로그인 등록 수정 조회 검증`.
- 최종 상태: CANCELLED, deactivated_at 존재, 취득가0, 배정0.
- 파괴 삭제는 하지 않았다. 취소된 시험 자산1개와 관련 감사이력은 원장에 남는다. 실물·실제 비용으로 사용하면 안 된다.

## 한계·다음 작업

현재 `asset.update` 권한은 상태 변경에서만 사용된다. 등록 후 자산명·분류·위치·취득일 등 일반정보를 고치는 UI와 endpoint가 없으므로, 이번 요청의 ‘수정’을 일반정보 편집까지 포함하면 부분 충족이다. 점검 요청만으로 기능을 추가·배포하지 않았다. 다음 권장 READY는 **기본정보 수정의 허용 필드·권한·감사·동시수정 계약 확정 및 구현**이다.

이 증거는 실제 운영 HTTP/API·PostgreSQL 통합검증이지 브라우저 클릭 E2E, 직원 업무 UAT, 모든 역할·오류·경쟁조건 검증은 아니다. 기존52화면 배치 시험을 이번 로그인/쓰기 시험으로 재사용하지 않았다.

## 재현·근거

- 계약: `agent docs/prompts/PRODUCTION_ASSET_UAT_20261029.md`.
- 검사기: `scripts/production-asset-uat.mjs`. 기본 실행은 읽기 전용 preflight, `--execute`만 고유 시험 자산1개를 생성·상태수정한다. 직원 credential 거부·기존 시험 표식 존재 시 재생성 차단·특정 생성 actor/조직/표식 검증·실패 시 소유 시험 자산만 취소·logout·보존 비교가 있다.
- 실제 실행: `node --check scripts/production-asset-uat.mjs` 종료0; `node scripts/production-asset-uat.mjs` preflight 종료0; 승인된 `--execute`＋create-only 증거 경로 실행 종료0.
- 기계 증거: `agent docs/harness/PRODUCTION_ASSET_UAT_20261029_EVIDENCE.json`.
- 동일 표식이 이미 있으므로 이 실행을 재시도해 새 자산을 만들지 않는다. 후속 시험은 새 고유 표식·대상과 현재 권한을 확인해야 한다.
