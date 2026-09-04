# PE-C5 G1 HR inbox·감사 원장 체크리스트

기준일: 2026-09-04 KST

상태: **G1 증거 있는 완료 / C5 진행 중**

다음 READY: `PE-C5-G2-EMPLOYEE-LIFECYCLE-MAPPING-AND-EXCEPTION-QUEUE`

## 1. 목표·범위

- [x] G0에서 검증된 최소 HR 이벤트를 조직별 수신 원장에 기록한다.
- [x] 처리·중복·충돌·재시도·적용·거부를 감사 추적한다.
- [x] 실제 HR 공급자·직원 업무 데이터·Production·staging은 변경하지 않았다.

## 2. DB·기능

- [x] forward-only `029_hr_integration_inbox.sql`
- [x] `(organization_id, provider_id, external_event_id)` UNIQUE
- [x] normalized JSONB·payload SHA-256·event/status CHECK·claim index
- [x] `FOR UPDATE SKIP LOCKED`, 5분 stale lock 회수, lock 소유자 완료
- [x] 지수 재시도 1시간 상한과 열 번째 실패 DEAD_LETTER

## 3. 시험·검증

- [x] 실패 우선 `MODULE_NOT_FOUND` 재현
- [x] 집중 단위·migration 시험 10 PASS / 0 FAIL
- [x] 저장소 구문 455개 PASS
- [x] 전체 단위 950 PASS / 8 SKIP / 0 FAIL
- [x] strict 메타프롬프트 8/8, Harness 오류 0건

## 4. 로컬 PostgreSQL 통합

- [x] `127.0.0.1:55432` 개발 DB에 application migration 28/28 적용
- [x] 합성 이벤트 2건을 최종 `APPLIED`, `REJECTED`로 전이
- [x] 동일 payload duplicate와 다른 payload conflict 차단
- [x] 감사 action 6종과 retry 후 재claim을 실제 DB에서 확인
- [x] 합성 inbox/audit 잔존 행 0/0

## 5. 보안·개인정보

- [x] 검증 전 raw payload를 저장하지 않는다.
- [x] 오류 메시지·공급자 응답 대신 제한된 오류 코드만 저장한다.
- [x] 조직을 포함하지 않은 전역 event ID 중복키를 사용하지 않는다.
- [x] 실제 Secret·직원 개인정보·외부 데이터 전송이 없다.

## 6. Git·Rollback

- [x] 구현 파일 8개만 exact allowlist stage
- [x] 예상 외 staged 파일 0, 강한 credential 패턴 0, diff check PASS
- [x] WIP 복구 체크포인트 `38b50abf7de3aff842c003274ae1a560567a06ce` push·SHA 일치
- [x] 사용자 소유 dirty 파일 2개 보존
- [x] DB rollback은 데이터 삭제가 아니라 새 기능 미사용과 forward migration으로 수행한다.

## 7. 잔여 Gate

- [x] G1 증거와 C5 체크리스트·다음 READY를 동기화했다.
- [x] P7 `7/8`, Production GO `true`를 변경하지 않았다.
- [ ] G2에서 외부 조직·부서 코드를 내부 ID로 명시 매핑하고 퇴사자 보유자산을 예외 큐로 보낸다.
- [ ] 실제 공급자·endpoint·Secret·UAT는 G4 외부 Gate다.
- [-] C6 IoT는 자산군·ROI·공급자 PoC 승인 전까지 보류다.

G1만 닫혔으며 C5 전체 완료가 아니다.
