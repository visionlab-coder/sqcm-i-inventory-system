# PE-C5 G2 직원 생애주기 매핑·예외 큐 체크리스트

기준일: 2026-09-04 KST

상태: **G2 증거 있는 완료 / C5 진행 중**

다음 READY: `PE-C5-G3-ERP-EAPPROVAL-DELIVERY`

## 1. 목표·범위

- [x] 외부 조직·부서·직원 코드를 provider·organization 범위에 명시 매핑한다.
- [x] 이동·정보갱신·퇴사 이벤트를 기존 내부 사용자에만 적용한다.
- [x] 실제 HR 공급자·직원 데이터·Production·staging은 변경하지 않았다.

## 2. DB·기능

- [x] forward-only `030_hr_lifecycle_mapping_exceptions.sql`
- [x] 조직·부서·직원 링크 UNIQUE와 활성 매핑
- [x] OPEN·RESOLVED·IGNORED 상태의 담당자 예외 큐
- [x] inbox lock 소유권, 사용자·부서 조직 일치, 원자적 업무·감사·완료 처리
- [x] 이메일 identity 변경과 잘못된 부서 자동 적용 차단

## 3. 안전한 생애주기 처리

- [x] 직원 링크 미존재 시 사용자 자동 생성 0, `HR_EMPLOYEE_LINK_MISSING`
- [x] 명시 매핑된 이동은 부서 변경과 `HR_EVENT_APPLIED` 감사 처리
- [x] 활성 자산 보유 퇴사는 사용자 ACTIVE·배정 ACTIVE를 그대로 보존
- [x] 보유 자산 수만 safe details로 남기고 개인정보·원문 payload를 예외에 복제하지 않음

## 4. 시험·검증

- [x] 실패 우선 `MODULE_NOT_FOUND` 재현
- [x] 집중 단위·migration 시험 9 PASS / 0 FAIL
- [x] 저장소 구문 458개 PASS
- [x] 전체 단위 954 PASS / 8 SKIP / 0 FAIL
- [x] Harness P7 7/8·오류 0건 유지

## 5. 로컬 PostgreSQL·운영 불변식

- [x] `127.0.0.1:55432` 개발 DB application migration 29/29
- [x] 합성 이동 APPLIED, 자산 보유 퇴사 REJECTED·OPEN 예외 1건
- [x] 합성 inbox·직원 링크·부서 매핑·조직 매핑 잔존 행 각각 0
- [x] 로컬 frontend·backend·database 정확히 3서비스 healthy
- [x] 1234·11434·18766 listener 유지; 18765는 재부팅 이후 기존 미복구 상태이며 본 작업에서 프로세스 변경 0

## 6. Git·Rollback

- [x] 구현 파일 7개만 exact allowlist stage
- [x] staged diff check와 강한 credential pattern 검사 PASS
- [x] WIP 복구 체크포인트 `6651ae0d540dc60a4b718104b49f9d7578921226` push·SHA 일치
- [x] 사용자 소유 dirty 파일 2개 보존
- [x] rollback은 030 테이블 미사용과 후속 forward migration이며 기존 migration을 수정하지 않는다.

## 7. 잔여 Gate

- [x] G2 증거와 C5 체크리스트·다음 READY를 동기화했다.
- [x] P7 `7/8`, Production GO `true`를 변경하지 않았다.
- [ ] G3에서 기존 outbox를 승인 endpoint에 서명 전송하고 receipt·retry·dead-letter·관리자 재처리를 검증한다.
- [ ] G4 실제 공급자·endpoint·Secret reference·UAT·배포는 외부 Gate다.
- [-] C6 IoT는 자산군·ROI·공급자 PoC 승인 전까지 보류다.

G2만 닫혔으며 C5 전체 완료가 아니다.
