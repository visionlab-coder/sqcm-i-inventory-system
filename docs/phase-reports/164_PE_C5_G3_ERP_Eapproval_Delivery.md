# PE-C5 G3 ERP·전자결재 delivery 체크리스트

기준일: 2026-09-04 KST

상태: **G3 증거 있는 완료 / C5 진행 중**

다음 READY: `PE-C5-G4-ACTUAL-PROVIDER-UAT-AND-DEPLOYMENT`

## 1. 목표·범위

- [x] 기존 outbox를 공급자 독립 HTTPS publisher로 전달할 수 있게 했다.
- [x] 서명·receipt·재시도·dead-letter·관리자 재처리·감사를 구현했다.
- [x] 실제 ERP·전자결재 공급자·업무 데이터·Production·staging은 변경하지 않았다.

## 2. DB·전달 기능

- [x] forward-only `031_outbox_delivery_receipts.sql`
- [x] provider·receipt ID·receipt SHA-256·안전한 실패 코드 저장
- [x] canonical envelope와 timestamp의 HMAC-SHA256 서명
- [x] HTTPS 전용, 32 byte 이상 Secret, 10초 timeout, 64 KiB 응답 상한
- [x] 유효하지 않은 receipt 실패 폐쇄

## 3. 재처리·감사 안전성

- [x] 열 번째 실패 시 dead-letter 전환
- [x] provider 원문 오류·응답 본문·Secret 미보관
- [x] ADMIN 전용, 조직 범위 dead-letter 재처리
- [x] 기존 최근 재인증 middleware와 `admin.manage` 권한 적용
- [x] `OUTBOX_REQUEUED` 감사 이벤트 기록

## 4. 시험·검증

- [x] receipt·민감 오류 미보관·재처리 실패 우선 시험 작성
- [x] 집중 단위·migration 시험 13 PASS / 0 FAIL
- [x] 저장소 구문 461개 PASS
- [x] 전체 단위 958 PASS / 8 SKIP / 0 FAIL
- [x] 합성 ERP 전달 통합: signed delivery·receipt·dead-letter·ADMIN requeue audit·cleanup 0 PASS
- [x] Harness P7 7/8·오류 0건 유지

## 5. 로컬 PostgreSQL·운영 불변식

- [x] `127.0.0.1:55432` 개발 DB application migration 30/30
- [x] 통합 실행기는 exact 합성 event ID만 처리하여 기존 outbox를 보존한다.
- [x] 로컬 frontend·backend·database 정확히 3서비스 healthy
- [x] 1234·11434·18766 listener 유지; 18765는 재부팅 이후 기존 미복구 상태이며 본 작업에서 프로세스 변경 0

## 6. Git·Rollback

- [x] 구현 파일 10개만 exact allowlist stage
- [x] staged diff check와 강한 credential pattern 검사 PASS
- [x] WIP 복구 체크포인트 `afdef50f4c34532bd1b01d0f3ec0bfe1ce818308` push·SHA 일치
- [x] 사용자 소유 dirty 파일 2개 보존
- [x] rollback은 publisher 미구성·route 미호출과 후속 forward migration이며 기존 migration을 수정하지 않는다.

## 7. 잔여 Gate

- [x] G3 증거와 C5 체크리스트·다음 READY를 동기화했다.
- [x] P7 `7/8`, Production GO `true`를 변경하지 않았다.
- [ ] G4에서 승인된 실제 공급자·endpoint·Secret reference·필드 매핑으로 정상·변조·중복·timeout·rollback UAT를 수행한다.
- [ ] G4 실제 배포와 수신증이 없으므로 C5 전체 완료로 전환하지 않는다.
- [-] C6 IoT는 자산군·ROI·공급자 PoC 승인 전까지 보류다.

G3만 닫혔으며 C5 전체 완료가 아니다. 다음 작업은 실제 공급자 입력이 있어야 외부 변경 없이 정확한 preflight부터 시작할 수 있다.
