# PE-C5 G0 HR·ERP 연동 보안 계약 체크리스트

기준일: 2026-09-04 KST

상태: **G0 증거 있는 완료 / C5 진행 중**

다음 READY: `PE-C5-G1-HR-INBOX-AND-AUDIT-LEDGER`

## 1. 목표·범위

- [x] 실제 공급자에 종속되지 않은 HR 수신·ERP 발신 계약을 고정했다.
- [x] 실제 endpoint·계정·Secret·데이터·DB·Production·staging은 변경하지 않았다.
- [ ] C5 전체 완료에는 G1~G4의 원장·업무 적용·delivery·실제 UAT가 남아 있다.

## 2. 기능·산출물

- [x] HR raw body HMAC-SHA256 `v1`, 300초 허용창, 최대 1 MiB 계약
- [x] event ID 기반 외부 replay 저장소 명시적 예약 계약
- [x] `employee.upserted/transferred/terminated` 최소 필드 정규화
- [x] ERP canonical payload SHA-256, idempotency key, 금지 필드 차단 봉투

## 3. 시험·검증

- [x] 실패 우선 시험에서 구현 전 `MODULE_NOT_FOUND`를 재현했다.
- [x] 집중시험 4 PASS / 0 SKIP / 0 FAIL
- [x] 저장소 구문 452개 PASS
- [x] 전체 단위 945 PASS / 8 SKIP / 0 FAIL
- [x] 메타프롬프트 strict 8/8, Harness 오류 0건

## 4. 보안·개인정보

- [x] JSON 파싱 전에 원문 bytes 서명을 상수시간 비교한다.
- [x] 잘못된 서명·만료·중복·과대·invalid JSON을 fail-closed 한다.
- [x] password·secret·token·authorization·cookie·주민식별 계열 ERP 필드를 거부한다.
- [x] 실제 Secret·개인정보를 코드·시험·문서·Git에 넣지 않았다.

## 5. 데이터·연동 경계

- [x] 공급자가 추가 필드를 보내도 승인된 최소 HR 필드만 전달한다.
- [x] ERP payload는 key 순서와 무관한 결정적 SHA-256으로 결박한다.
- [x] 현재 outbox 재시도·dead-letter를 교체하지 않고 후속 adapter 경계를 열었다.
- [ ] event ID UNIQUE·수신/거부/재처리·감사 원장은 G1에서 구현한다.

## 6. Git·Rollback

- [x] 코드·시험·메타프롬프트·제품 로드맵 네 파일만 exact allowlist로 stage했다.
- [x] staged 예상 외 파일 0, 강한 credential 패턴 0, diff check PASS
- [x] WIP 복구 체크포인트 `13d5cd57c7122b087b4acb395d54d0f8bd712d09`을 동일 원격 branch에 push하고 SHA 일치를 확인했다.
- [x] 사용자 소유 dirty 파일 2개를 stage·수정하지 않고 보존했다.

## 7. 문서·잔여 Gate

- [x] 사람용 체크리스트, 기계 증거, 제품 로드맵, 현재 상태를 같은 사실로 동기화했다.
- [x] P7 `7/8`과 Production GO `true`는 변경하지 않았다.
- [ ] 실제 HR·ERP 공급자, endpoint, 필드 매핑, Secret reference, 시험 담당자는 G4 전에 확정해야 한다.
- [-] C6 IoT는 자산군·ROI·공급자 PoC 승인 전까지 승인된 보류다.

G0만 닫혔으므로 C5는 완료가 아니다. 다음 Loop에서는 DB에 외부 event ID 중복을 막는 HR inbox와 처리·거부·재처리 감사 원장을 추가한다.
