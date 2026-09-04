# SQCM-i C 제품 고도화 로드맵

기준일: 2026-09-04 KST

## 제품 정의

`SQCM-i C`는 **Construction Asset Control & Cost**를 뜻한다. Excel 목록을 웹으로 옮기는 데 그치지 않고 건설회사 비품의 식별, 위치, 사용자, 상태, 비용, 증빙과 감사 연결을 하나의 원장으로 유지한다.

독보적 가치의 네 축은 다음과 같다.

1. **Control:** 조직·부서 범위, 승인, 배정·반납, 재물조사와 상태 전이를 통제한다.
2. **Cost:** 새로 구매하기 전에 다른 부서·현장의 가용·유휴 자산과 수리·교체 비용을 비교한다.
3. **Chain of custody:** 누가 언제 무엇을 인수·반납·변경했는지 증빙과 감사 이력으로 연결한다.
4. **Construction field:** PC가 아닌 모바일 현장, 불안정한 네트워크, 다수 사업장과 공구·장비 사용을 기준으로 설계한다.

## 시장 비교에서 확정된 방향

- 유지·강화: 회사 맞춤 workflow, 한국어 UX, 데이터 통제, 승인·감사, TCO/유휴자산 의사결정
- 자체 구현 우선: Excel 이관, QR/바코드, 라벨, PWA 오프라인 재물조사, 직원 셀프서비스
- 선택 연동: 대량 RFID, GPS, BLE, 중장비 텔레매틱스는 필요 자산군이 확정될 때 전문 공급자와 API로 연동
- 금지: 시장 제품 기능을 근거 없이 모두 복제하거나, 하드웨어가 필요한 기능을 소프트웨어 완료로 표시하는 것

## 고도화 Epic

| 순서 | Epic | 사용자 가치 | 완료 게이트 | 상태 |
|---:|---|---|---|---|
| C1 | Excel 원장 안전 이관 | 기존 Excel을 오류·부분등록 없이 통합 원장으로 전환 | 템플릿→미리보기→행별 오류→원자적 확정→감사, 회귀시험 PASS | 완료 · `14fdcb8` push |
| C2 | QR 자산 신분증·라벨 | 현장에서 카메라 또는 수동 코드로 즉시 자산 확인 | 자체 QR, 인쇄 라벨, 위조·다른 조직 차단, 모바일 상세 연결 | 완료 · `833ddfb` push |
| C3 | 오프라인 재물조사 | 통신 불량 현장에서도 조사 후 안전하게 동기화 | PWA cache, offline queue, 충돌 검토, 중복 전송 방지 | 완료 · `c851994` push |
| C4 | 직원 셀프서비스 | 사용자 스스로 보유자산·반납·분실·수리 요청 | 모바일 390px, 알림 상태, 관리자 workflow 연계 | 완료 · `62fd863` push |
| C5 | 회사 시스템 연동 | HR 이동·퇴사와 ERP/전자결재를 중복 입력 없이 연결 | 승인된 API/Webhook, 서명 검증, outbox, 재처리·감사 | 진행 중 · G0~G2 PASS |
| C6 | 건설 자산 확장 | 차량·중장비·공구에 적합한 선택형 IoT | 자산군·ROI·공급자 PoC 승인 후 adapter 방식 연결 | 승인된 보류 |

## C1 요구사항과 상태 매트릭스

| ID | 상태/역조건 | 기대 결과 |
|---|---|---|
| C1-R01 | 템플릿 다운로드 | 한국어 헤더와 가상 예시만 포함한 UTF-8 BOM CSV |
| C1-R02 | 정상 미리보기 | 총계·등록 가능·수정 필요와 행별 결과 표시, DB 변경 0 |
| C1-R03 | 헤더·형식 오류 | 미지원/중복/필수열 누락과 닫히지 않은 따옴표 차단 |
| C1-R04 | 데이터 오류 | 번호·이름·제조번호·상태·기준코드·날짜·금액·수식·중복을 행별 표시 |
| C1-R05 | 권한 오류 | USER 403, 조직/부서 범위 밖 코드 차단 |
| C1-R06 | 확정 등록 | 미리보기 checksum 재검증 후 최대 500행 전부 또는 전무 등록 |
| C1-R07 | 재전송 | CSRF와 Idempotency-Key로 동일 요청 중복 생성 방지 |
| C1-R08 | 감사 | 자산별 `ASSET_IMPORTED`와 묶음 `ASSET_BULK_IMPORTED`, 상태이력·outbox 기록 |
| C1-R09 | 반응형/접근성 | 키보드 label, live result, 오류 텍스트, 900px 이하 단일 열 |

## 다음 READY 계약

C4 구현과 검증은 PASS했다. 전체 941 PASS·8 SKIP, UI 40/40, PostgreSQL 통합 24 PASS·1 실제 Defender SKIP, migration 27/27과 로컬 3서비스가 통과했다. 합성 USER 브라우저에서 내 자산 1·타인 표시 0·타인 요청 HTTP 403, 분실 요청 `SUBMITTED`·감사 2건, 1440×900·390×844 가로 넘침 0을 확인했다. exact allowlist 완료 commit `62fd863949bbba93ca6751406b71e8e8b2614c7a`을 push하고 SHA 일치를 확인해 C4를 닫았다.

## C5 실행 체크리스트

| 순서 | 작업 | 완료 조건 | 상태 |
|---:|---|---|---|
| G0 | 공급자 독립 HR·ERP 계약 | raw-body HMAC, 300초 window, replay guard, HR 최소 스키마, ERP payload hash·금지필드 시험 | 증거 있는 완료 |
| G1 | HR inbox·감사 원장 | event ID UNIQUE, 수신·거부·재처리 상태, payload 최소보관, audit를 transaction으로 검증 | 증거 있는 완료 |
| G2 | 직원 이동·퇴사 적용 | 외부 코드를 내부 조직·부서에 명시 매핑하고 미매핑·퇴사 보유자산을 예외 큐로 보냄 | 증거 있는 완료 |
| G3 | ERP·전자결재 delivery | 기존 outbox를 승인 endpoint에 서명 전송하고 receipt·retry·dead-letter·관리자 재처리를 검증 | READY |
| G4 | 공급자 UAT·배포 | 승인 공급자·endpoint·Secret reference로 정상·변조·중복·timeout·rollback 실제 증거 확보 | 외부 입력 대기 |

현재 제품 READY는 `PE-C5-G3-ERP-EAPPROVAL-DELIVERY`다. G2는 외부 조직·부서·직원 명시 매핑과 안전한 생애주기 적용, 미매핑·이메일 identity 변경·퇴사 보유자산 예외 큐를 구현했다. 전체 단위 954 PASS·8 SKIP, 로컬 application migration 29/29와 합성 이동 APPLIED·퇴사 REJECTED·cleanup 0이 PASS했다. C5 전체 완료는 아니며 실제 연동 전에 HR·ERP 공급자, endpoint, 필드 매핑, Secret reference, 시험 담당자 승인이 필요하다.

C1 완료 뒤 여는 다음 제품 Epic은 아래와 같다.

`PE-C2-QR-ASSET-IDENTITY-AND-LABEL`

- QR payload에는 Secret이나 개인정보를 넣지 않고 조직에 종속된 불투명 자산 식별자만 둔다.
- 공개 스캐너가 직접 자산 데이터를 반환하지 않으며 인증 후 조직·부서 권한을 다시 검사한다.
- A4 라벨 인쇄, 개별 라벨, 카메라 미지원 시 수동 입력, 390×844 화면을 함께 검증한다.
