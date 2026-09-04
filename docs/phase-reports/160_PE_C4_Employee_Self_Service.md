# PE-C4 직원 셀프서비스 체크리스트

기준일: 2026-09-04 KST

상태: **증거 있는 완료**

다음 READY: `PE-C5-HR-ERP-INTEGRATION-CONTRACT`

## 1. 목표·범위

- [x] 직원이 내 활성 배정 자산과 내 요청·수리·알림만 한 화면에서 확인한다.
- [x] 반납·수리·분실 요청을 기존 승인 workflow로 제출한다.
- [x] 관리자 기능, 실제 직원 데이터, HR/ERP, Production·staging은 변경하지 않았다.

## 2. 기능·산출물

- [x] `GET /api/enterprise/self-service` 본인 전용 집계
- [x] `POST /api/enterprise/self-service/requests` 활성 자기 배정 역검사
- [x] 반납 사진·상태·부속품과 수리·분실 사유 빠른 요청
- [x] 내 자산·진행 요청·수리·새 알림 요약과 상세 원장

## 3. 시험·검증

- [x] 저장소 구문 450개 PASS
- [x] 단위 941 PASS / 8 SKIP / 0 FAIL
- [x] PostgreSQL 통합 24 PASS / 실제 Defender 1 SKIP / 0 FAIL
- [x] UI 계약 40/40 PASS, migration 27/27, Compose 3서비스
- [x] 합성 USER: 내 자산 1, 타인 자산 표시 0, 타인 요청 HTTP 403
- [x] 분실 신고 `SUBMITTED`, 감사 이벤트 2건

## 4. 보안·개인정보

- [x] 조직뿐 아니라 `asset_assignments.user_id`를 API SQL에서 재검사한다.
- [x] 요청·수리·알림은 requester/reporter/recipient 사용자 ID로 제한한다.
- [x] CSRF·idempotency·감사·승인 계약을 재사용한다.
- [x] Secret·비밀번호·실제 개인정보는 증거와 커밋에 넣지 않았다.

## 5. 화면·접근성

- [x] 빈 자산·빈 요청·빈 수리·빈 알림 상태를 표시한다.
- [x] 요청 dialog에 label, 닫기 이름, 제출 중 중복 방지를 제공한다.
- [x] 1440×900·390×844에서 가로 넘침 0, 자산별 3개 우선 행동을 확인했다.
- [x] 데스크톱 SHA-256 `82becaff18753657174bad542af0b6b82568f2a4b330794962f3567a83b96835`
- [x] 모바일 SHA-256 `0721cf2756b3169f2345e2fa8f4a3921693e786fb36cfcca105b31beb2d37696`

## 6. 데이터·Rollback

- [x] 기존 27개 migration을 변경하거나 추가하지 않았다.
- [x] 합성 사용자·자산·배정·요청·세션·감사를 exact cleanup했다.
- [x] 합성 잔존 수 users/assets/requests = 0/0/0이다.
- [x] 사용자 소유 dirty 파일 2개를 변경 범위에서 제외했다.

## 7. 문서·Harness·Git

- [x] 8항목 실행 계약, 사람용 체크리스트, 기계 증거를 같은 결과로 작성했다.
- [x] P7 7/8과 Production GO true는 변경하지 않았다.
- [x] C4 exact allowlist 완료 commit·push `62fd863949bbba93ca6751406b71e8e8b2614c7a`와 local/remote SHA 일치

C4를 `증거 있는 완료`로 닫고 C5 계약 작업을 연다.
