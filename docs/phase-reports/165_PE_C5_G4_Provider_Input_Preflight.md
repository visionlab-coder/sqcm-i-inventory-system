# PE-C5 G4 ERP·전자결재 공급자 입력 사전검토 체크리스트

기준일: 2026-09-07 KST

상태: **입력 Gate 증거 있는 완료 / 실제 G4 UAT·배포 HOLD_EXTERNAL_INPUT**

다음 READY: `PE-C5-G4-ACTUAL-PROVIDER-INPUT-BINDING`

## 1. 목표·승인큐

- [x] 김무빈 차장의 2026-09-07 지시를 조건부 승인으로 기록했다.
- [x] 승인 범위는 기존 5항목 확인과 합성 contract test 준비다.
- [x] 5항목과 근거 확인 전 외부 호출·배포·결재/자금 변경 금지를 Gate로 고정했다.
- [ ] 실제 staging UAT release 상태 `APPROVED_FOR_STAGING_UAT`는 아직 아니다.

## 2. 기존 문서·설정 확인

| 필수 입력 | 판정 | 근거 |
|---|---|---|
| 제품명·공급자·API version | MISSING | G3 증거의 `ACTUAL_ERP_EAPPROVAL_PROVIDER_NOT_SELECTED` |
| 공급자 결박 HTTPS endpoint | MISSING | staging 일반 event publisher는 C5 ERP 공급자 endpoint가 아님 |
| 공급자별 필드 매핑 | MISSING | 공통 canonical 봉투만 있고 공급자 문서·상태·receipt 매핑 없음 |
| C5 HMAC Secret reference | MISSING | 일반 `EVENT_PUBLISHER_*` reference는 C5 전용 결박 증거가 아님 |
| 시험 책임자 | MISSING | 승인자 김무빈 차장을 UAT 실행·결과서명·rollback 책임자로 임의 승격하지 않음 |

## 3. 입력 계약·보안

- [x] 제품·공급자·API version과 evidence reference를 함께 요구한다.
- [x] staging HTTPS POST, credential·query·fragment·example hostname 차단
- [x] outbound 7필드와 receipt 2필드의 방향·분류·근거 요구
- [x] `secret://` 또는 `/run/secrets/` reference만 허용
- [x] raw Secret·token·password·credential key가 있으면 fail-closed
- [x] 시험 책임자의 실행·결과서명·rollback 책임을 모두 요구

## 4. 합성시험·검증

- [x] 최초 합성시험 14 PASS / 2 FAIL로 값 존재와 evidence 길이 검사 혼동을 재현했다.
- [x] 검사 목적을 분리한 최소 수정 후 집중 16 PASS / 0 FAIL
- [x] 전체 구문 464개 PASS
- [x] 전체 단위 962 PASS / 8 SKIP / 0 FAIL
- [x] Harness P7 7/8·오류 0건 유지
- [x] 현재 입력계약은 예상대로 `HOLD_EXTERNAL_INPUT`, exit 2

## 5. 외부·운영 불변식

- [x] 외부 HTTPS 호출 0
- [x] staging·Production 배포·migration 0
- [x] 실제 결재·자금·직원·자산 데이터 변경 0
- [x] Secret 값 읽기·출력·기록 0
- [x] 일반 event publisher를 실제 C5 provider로 승격하지 않음

## 6. Git·복구

- [x] 구현·입력계약 5개만 exact allowlist stage
- [x] staged diff·credential pattern 검사 PASS
- [x] WIP 복구 체크포인트 `f1c637293efc16c75ebda564ccf79b4a1429f95b` push·SHA 일치
- [x] 기존 사용자 소유 dirty 파일 3개 보존
- [x] 외부 연결 전 rollback은 입력계약을 `HOLD_EXTERNAL_INPUT`으로 유지하는 것이다.

## 7. 입력 체크리스트·다음 Gate

- [ ] 실제 제품명, 공급자, API version과 승인 근거
- [ ] 정확한 staging HTTPS POST endpoint와 대상 tenant 근거
- [ ] outbound·receipt 필드 매핑표와 데이터 분류·근거
- [ ] C5 전용 signing Secret reference, 회전 책임자, 철회 runbook
- [ ] UAT 실행·결과서명·rollback 책임자와 지정 근거
- [ ] 위 5항목에 결박된 `APPROVED_FOR_STAGING_UAT` 승인 영수증

입력 Gate 자체는 완료됐지만 실제 G4와 C5 Epic은 완료가 아니다. 다음 Loop는 위 값을 정본에 결박하고 preflight를 다시 실행하는 작업이다.
