# Astra 제품 감사 — R0 진행 중 / C3 오류 분류 로컬 보완

기준일: 2026-09-07. 기준 HEAD `17d09ccad7708bc9821c1338df038317d9e56185`.
실행 계약: `agent docs/prompts/108_Astra_Product_Audit_And_Modernization.md`.
현재 운영 Harness P7 7/8, productionGo=true는 유지한다. R0 전체 또는 제품 전체 완료 보고가 아니다.

## 확인된 사실과 우선순위

1. **P1 / C3:** `renderStocktakeDetail`이 모든 예외를 저장 snapshot으로 대체했다. 서버 권한 거부와 저장소 quota 실패도 오프라인 화면으로 오인했다. 실제 함수의 VM 실행에서 신규 시험 8개 중 7개가 수정 전 실패했다.
2. **P1 / C3 / 다음 READY:** IndexedDB의 snapshot·operation은 stocktakeId로만 구분되며 사용자·조직 식별 경계가 없다. 이번 오류 분류 수정으로 계정별 저장소 격리까지 해결한 것은 아니다. 공유 기기 계정 전환·역할 회수·진행 중 요청 전환에 대한 보존 정책과 격리 시험이 필요하다. 기존 미동기화 데이터를 임의 삭제하지 않는다.
3. **P1 / 배포 추적:** current-state의 main 기준은 `93aa5b8…`지만 현재 Production frontend image tag/revision은 `38b2bca7f34a7a950469c8d0cd6d2a4b11e3b7a6`이다. staging frontend는 `seowon-inventory-frontend:local`, revision label 없음. 실제 image 내용·배포 이력을 추가 대조하기 전 어느 구현이 배포됐는지 단정하지 않는다.
4. **P2 / 상태 정합성:** 기존 로드맵에는 C2/C3/C4 다음 READY라는 역사 문구가 혼재한다. C5 현재 계약은 5항목 null과 조건부 승인이다. 이를 새 공급자 승인으로 해석하지 않는다.

## 업무별 증거 수준

| 업무 흐름 | 문제·영향 | 구현 | 로컬 검증 | staging | Production | 실제 UAT | 다음 READY |
|---|---|---|---|---|---|---|---|
| 로그인·초기 비밀번호 | 전체 생애주기 재감사 필요 | 기존 구현 | 관련 단위 포함, E2E 재실행 안 함 | 미확인 | 버전 대조 필요 | 이번 NOT_RUN | 핵심 로그인 브라우저 재검증 |
| C1 Excel 이전 | 오류 복구·실제 원장 표본 확인 필요 | 존재 | 전체 단위 PASS, 통합은 과거 증거 | 미확인 | 미확인 | 이번 NOT_RUN | 실제 이전 경로 대조 |
| C2 QR | 배포 버전 확인 필요 | 기존 증거 | 전체 단위 PASS | 미확인 | 미확인 | 이번 NOT_RUN | 후보 버전 대조 |
| C3 오프라인 | 권한 거부 fallback 결함 수정 / 계정 격리 미완료 | 로컬 수정 | 집중 13/13 | 미배포 | 미배포 | NOT_RUN | R0-C3-ACCOUNT-SCOPED-OFFLINE-STORAGE |
| C4 내 비품·반납·수리 | 동시 배정 변경·집계 범위 추가 감사 | 존재 | 전체 단위 PASS | 미확인 | 미확인 | 이번 NOT_RUN | 동시성·페이지 집계 검증 |
| C5 ERP·전자결재 | 실제 입력 5항목 없음 | G0~G3 기존 기록 | 합성 증거만 존재 | HOLD | HOLD | NOT_RUN | 승인된 provider 입력 |
| P7 운영 인수 | 운영 8영역 증거와 서명 | Harness 존재 | harness check PASS | N/A | GO 문서값 유지 | 미완료 | 기존 P7 READY 유지 |

## 이번 수정과 수용조건

- fetch 자체의 TypeError만 NETWORK_UNAVAILABLE로 분류한다. HTTP 거부·응답 처리 오류는 해당 분류로 바꾸지 않는다.
- 재물조사 읽기는 해당 분류이며 로그인된 관리자/담당자이고 초기 비밀번호 변경 대상이 아닐 때만 snapshot 대체를 허용한다.
- 서버 읽기가 성공했다면 로컬 snapshot 저장 실패로 과거 화면을 대신 표시하지 않는다.
- 쓰기도 navigator.onLine 값만으로 서버 거부를 queue에 넣지 않는다. 분류된 네트워크 실패만 대기시킨다.
- 남은 위험: snapshot 저장 실패 안내, 계정별 namespace, 저장기간·권한 회수, 실제 IndexedDB·브라우저 E2E. 클라이언트 판정은 서버 인가를 대체하지 않는다.

## 검증

- harness:status: P7 7/8; harness:check: PASS, 오류 0.
- 수정 전 신규 시험: 1 PASS / 7 FAIL, exit 1 — 결함 재현.
- 수정 후 focused: 13 PASS / 0 FAIL, exit 0. 실제 app 함수 VM 실행 + 기존 정적 PWA 계약이며 실제 브라우저 시험은 아니다.
- npm.cmd run check: 구문 465, 단위 970 PASS / 8 SKIP / 0 FAIL, exit 0.
- 쓰기 역조건 2개 추가 후 npm.cmd run test:unit: 972 PASS / 8 SKIP / 0 FAIL, exit 0.
- ui:contract: 40 PASS; git diff --check: exit 0.
- Docker read-only: inventory local/staging/production 각각 3개 healthy. Production·staging backend/database host publish 없음. local frontend는 0.0.0.0:3000, backend/database는 loopback 매핑이며 이번 변경 없음.
- 보호 listener: 1234/31896, 11434/13620, 18766/11460. 18765 없음은 기존 재부팅 후 기록과 같음. 프로세스 변경 없음. 37봇 전체 개별 검증은 NOT_RUN.

## 구조 판단과 11단계 추적

전면 재작성 근거는 아직 없다. 기존 계층을 보존한 경계 수정이 이번 재현 결함을 해결한다. R1 최종 아키텍처 판단은 R0의 배포·DB·브라우저 증거를 더 확보한 뒤 한다.
1 목표·2 문서·3 요구사항: 제출 계약과 기존 설계 확보, 상태 모순 일부 발견.
4 기능·5 인프라·6 DB: 코드·실행 상태 부분 점검, 전체 감사 미완료.
7 화면·8 개발: 오류 분류 수정과 VM 회귀 완료, 브라우저 미검증.
9 배포·10 통합: 이번 미실행. 11 유지보수: 기존 P7 유지.

## 7범주 체크리스트

- [x] 이번 최소 수정 범위·제외 범위 고정
- [x] 코드·시험·감사 보고서 존재
- [ ] 실제 브라우저·계정 전환 검증 잔여 — R0/C3 전체 완료 아님
- [x] Secret 미사용, 외부 API·배포·데이터 변경 없음
- [x] 현황·감사 연결, 운영 Phase 변경 없음
- [ ] 복구 체크포인트 원격 확인 잔여; 승인 remote URL과 원격 기준 SHA는 읽기 확인, private 여부 확인 도구 gh 미가용
- [x] 다음 READY와 남은 위험 명시

다음 READY: `R0-C3-ACCOUNT-SCOPED-OFFLINE-STORAGE`. 실제 계정 데이터 없이 합성 사용자 2명·조직 2개와 미동기화 작업을 사용해 격리·계정 전환·보존 정책을 검증한다. 이번 변경은 로컬 후보이며 자동 배포하지 않는다.
