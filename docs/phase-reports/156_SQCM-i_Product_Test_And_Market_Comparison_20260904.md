# SQCM-i 제품 검증 및 시장 비교 보고서

기준일: 2026-09-04 KST
대상: 서원토건 비품관리 시스템(SQCM-i Inventory)
비교 범위: 국내 4종, 글로벌 5종의 공식 공개자료와 현재 SQCM-i 코드·실행 증거

## Executive Summary

- **현재 애플리케이션 회귀시험은 깨끗한 격리 환경에서 통과했다.** JavaScript 구문 431개, 단위시험 923개 중 915 PASS·0 FAIL·8 SKIP, 통합시험 22개 중 21 PASS·0 FAIL·1 SKIP, UI 계약 25/25, 배포 스모크 5/5, PostgreSQL 필수 테이블 33/33을 확인했다. 실제 Production HTTPS도 스모크 5/5를 통과했다.
- **다만 “모든 종류의 시험이 끝났다”는 뜻은 아니다.** 실제 Windows Defender EICAR 연동 1건은 이번 격리 실행에서 SKIP됐고, Harness는 P7 운영 활성화·인수 증거가 남아 `7 / 8`이다. 30일 SLO, 외부 경보, off-site 백업·격리 복원, 온콜, 최종 MFA 운영 서명은 장기 운영 자격 증거다.
- **SQCM-i는 서원토건의 사내 비품·승인·구매·검수·배정·반납·수리·재물조사·감사·비용 통제에는 이미 사용가치가 있다.** 특히 회사 조직·권한·감사·Cost Command Center를 한 시스템에 맞춘 점은 범용 SaaS보다 강하다.
- **시장 선도 제품 대비 가장 큰 공백은 현장 수집 기술이다.** QR/바코드 카메라 스캔, 오프라인/PWA, RFID·GPS·IoT, 대량 엑셀 가져오기, 성숙한 네이티브 모바일 앱과 상용 지원 체계가 약하다. 따라서 코어를 교체하기보다 QR·오프라인을 우선 보완하고, 중장비·차량 IoT가 필요할 때만 Hilti ON!Track/EZO/RFID 솔루션과 연동하는 전략이 합리적이다.

## 1. 현재 시험 상태

### 1.1 검증 결과

| 검증 영역 | 현재 결과 | 판정 |
|---|---:|---|
| Harness 상태/계약 | `7 / 8`, 계약 오류 0 | PASS, P7 진행 중 |
| JavaScript 구문 | 431개 | PASS |
| 단위시험 | 923 total / 915 pass / 0 fail / 8 skip | PASS |
| 통합시험(격리 Docker) | 22 total / 21 pass / 0 fail / 1 skip | PASS_WITH_SKIP |
| UI 계약 | 25/25 | PASS |
| Docker 서비스 | frontend/backend/database 3개, 모두 healthy | PASS |
| 배포 스모크(격리 환경) | health, API health/readiness, 익명 401, 로고 5/5 | PASS |
| PostgreSQL 유지보수 검사 | 필수 테이블 33/33, PostgreSQL 16.15 | PASS |
| Production HTTPS 스모크 | `https://inventory.safe-link.co.kr` 5/5 | PASS |
| 실제 Defender EICAR | 이번 격리 실행 1건 SKIP | NOT_RUN |
| P7 운영 인수 | 장기 운영 증거와 최종 서명 잔여 | IN_PROGRESS |

**판정:** 코드·API·DB·UI 계약·배포 기본경로의 현재 회귀시험은 통과했다. 그러나 외부 공급자와 기간 기반 운영 증거까지 포함한 절대적 의미의 “전체 시험 완료”는 아니다.

### 1.2 한 차례 통합시험 실패의 원인

기존 로컬 DB를 재사용한 첫 실행에서는 자산 배정 승인 시험 1건이 실패했다. DB에 과거 시험이 남긴 우선순위 100의 2단계 승인 정책이 존재하여, 1회 승인 뒤 자산이 의도대로 `AVAILABLE`에 머문 것이 원인이었다. 제품 로직 오류가 아니라 **공유 시험 DB의 잔존 fixture가 다른 시험의 전제에 영향을 준 시험 격리 문제**다.

새 임시 Compose project와 새 PostgreSQL volume으로 재실행하자 동일 경로를 포함한 통합시험 21건이 모두 통과했다. 이 결과는 제품 기능을 확인하지만, 앞으로 CI와 개발자 전체시험은 항상 새 DB 또는 시험별 정책 정리를 강제해야 한다.

## 2. SQCM-i의 현재 제품 범위

코드·화면·통합시험에서 확인한 현재 범위는 다음과 같다.

- 자산 원장, 상태·위치·부서·사용자 범위 관리
- 자산 등록, 배정·반납·이동·분실·폐기 상태 전이
- 요청·다단계 승인·반려·자기승인 차단
- 구매 요청 → 발주 → 부분 입고 → 검수 → 개별 자산 생성
- 수리 티켓, 재물조사, 사진·증빙파일, 악성코드 검사 계약
- ADMIN·MANAGER·USER RBAC, 조직·부서 데이터 범위, 세션·CSRF·MFA
- 감사 로그, request ID, outbox, 멱등성, CSV 보고서
- Cost Command Center, TCO·유휴자산·공급사·예산·절감 원장, AI 추천/OCR adapter
- PostgreSQL 16, Docker 3서비스, 운영 공개 HTTPS, 백업·복원·롤백 실행 계약

공식 후속 작업으로 문서화된 공백은 QR·바코드, 이메일·메신저 알림, 일부 외부 공급자 운영 연결이다. 코드 검색에서도 RFID·GPS·오프라인 동기화와 네이티브 모바일 앱은 현재 제품 기능으로 확인되지 않았다.

## 3. 시장 제품 비교

표시 기준: `강점`은 공식 공개자료로 확인한 주력 기능, `공백/주의`는 공개자료에서 미확인하거나 SQCM-i 관점에서 불리한 부분이다. 공급자 마케팅 수치 자체는 검증된 성과로 사용하지 않았다.

| 제품 | 주력과 강점 | SQCM-i 대비 우위 | SQCM-i 대비 공백·주의 | 공개 가격/형태 |
|---|---|---|---|---|
| **SQCM-i** | 서원토건 맞춤 자산·승인·구매·검수·수리·실사·감사·TCO·AI | 회사 업무규칙, 한국어 UX, 데이터·배포 통제, 강한 보안/증거, 사용자당 라이선스 없음 | QR/바코드·오프라인·RFID/GPS·네이티브 앱·상용 지원 생태계 부족 | 자체 구축·운영비 중심 |
| **SAMQ** | 실물·IT·SW·계약 자산 전 생애주기, QR/바코드/NFC, 셀프 실사·대여·반납·수리, 오프보딩 | 즉시 사용 가능한 모바일 실사와 SW 라이선스 관리 | API/SSO·오프라인·건설 특화 범위는 공개자료로 불충분, SaaS 종속 | 클라우드 사용자당 월 과금 표기, 상세 조건 확인 필요 |
| **SELLEASE** | QR 실사, 자산지도, 전자서명 수령·회수, 대여·반납·수리, Open API·업무도구/ERP 연동 | 세련된 모바일 QR 운영과 표준 SaaS 연동 | RFID·오프라인·건설 장비/안전 특화는 미확인 | 무료 소규모 플랜, Business 월 149,000원 표기, Enterprise 견적 |
| **이주데이타 RFID** | RFID/바코드/QR, Android 실사 앱, 오프라인 SQLite 동기화, ERP·전자결재 연동 | 대규모·저연결 현장 재물조사와 RFID 일괄 스캔 | 구축비·기간, iOS·클라우드 가격·건설 특화 레퍼런스 확인 필요 | 구축형 견적 |
| **SMPLY** | SaaS 계정·비용, PC/IT기기·SW 사용량, 퇴사자 회수, Entra/Google/Slack 연동 | ITAM·SaaS 비용·단말 자동수집 | 실물 대여·수리·재물조사·현장 장비에는 범위가 좁음 | 가격 문의, 카드 없이 14일 체험 |
| **Snipe-IT** | 오픈소스 자가호스팅, 자산·소모품·라이선스, 체크인/체크아웃, QR, REST API·SAML/LDAP/SCIM | 성숙한 오픈소스 생태계·API·ITAM, 무료 소프트웨어 | 공식 네이티브 앱 부재, 오프라인·건설 IoT·구매검수 흐름 약함 | 자가호스팅 무료, 호스팅 월 USD 39.99부터 |
| **Sortly** | 쉬운 모바일 QR/바코드, 오프라인, Job/현장, 체크인/아웃, 재고수량, 발주·알림 | 빠른 현장 도입과 모바일 사용성 | 복잡한 승인·감사·보안·CMMS는 상위 플랜/검증 필요 | 무료, 유료 월 USD 49 정가부터(프로모션 별도) |
| **Asset Panda Pro** | 모바일 감사·사진·서명·점검·정비·예약·GPS pin, 맞춤 폼/자동화 | 현장 감사와 맞춤 모바일 workflow의 성숙도 | 높은 연간비용, 한국 데이터 소재지·지원·실제 오프라인 범위 확인 필요 | 공식 도움말 기준 연 USD 3,000부터, 계약 전 재확인 |
| **EZO** | 다지점 자산·재고·소모품, QR/바코드/RFID, 구매·예약·감사, CMMS·텔레매틱스 확장 | 가장 넓은 범용 EAM 기능과 확장 생태계 | 플랜별 기능 분절, 국내 지원·한국어·데이터 소재지 미확인 | 300 items 기준 월 USD 63.55부터 표시 |
| **Hilti ON!Track** | 건설 공구·차량·중장비·PPE·안전 인증, 태그·게이트웨이·GPS·정비, Open API | 건설 현장 IoT와 중장비·차량 가시성에서 압도적 | 견적·하드웨어·도입서비스 비용, 국내 계약조건 검증 필요 | 컨설팅/견적형 |

### 3.1 국내 제품과 비교한 SQCM-i의 위치

**SQCM-i는 범용 SaaS보다 회사 내부 통제와 업무 왕복이 깊다.** 구매 전 유휴자산 검토, 다단계 승인, 검수 전 배정 차단, 부서 범위 재검사, 감사·멱등성·롤백 증거는 서원토건 절차에 맞춰져 있다. 이는 외부 제품을 도입해도 별도 커스터마이징과 연계가 필요한 부분이다.

반면 SAMQ·SELLEASE는 QR 중심의 직원 셀프서비스와 상품화된 온보딩에서 앞서고, 이주데이타는 대량 RFID 및 네트워크 없는 재물조사에서 앞선다. SMPLY는 회사 PC와 SaaS 계정 비용을 자동수집하는 ITAM 영역에 더 집중한다.

### 3.2 글로벌 제품과 비교한 SQCM-i의 위치

**사무·현장 비품 workflow에서는 경쟁 가능하지만 물리 추적 하드웨어에서는 뒤처진다.** Snipe-IT보다 서원토건 구매·승인·검수와 비용 통제가 강하고, Sortly보다 RBAC·감사·업무 트랜잭션이 깊다. 그러나 Asset Panda/EZO의 성숙한 모바일 감사·맞춤 workflow, Hilti의 차량·중장비·센서 추적은 현재 SQCM-i 범위를 넘어선다.

따라서 현장 공구와 비품을 “누가, 어디서, 어떤 승인으로, 얼마에 사용 중인가”까지는 SQCM-i가 담당하고, 실시간 GPS·BLE·RFID 계측이 필요한 자산군만 외부 전문 시스템과 API로 결합하는 경계가 적절하다.

## 4. SQCM-i 장단점

### 강점

1. **서원토건 업무 적합성:** 조직·부서·현장 범위와 구매·검수·배정·반납을 한 흐름으로 관리한다.
2. **보안과 감사성:** MFA, RBAC, CSRF, 멱등성, 조직 범위 SQL, 감사 로그와 요청 추적을 기본 계약으로 둔다.
3. **비용 의사결정:** 단순 자산대장보다 TCO, 유휴자산 이전, 수리 대 교체, 예산·공급사·절감 원장을 함께 본다.
4. **소유권과 확장성:** PostgreSQL 데이터와 코드를 회사가 통제하며 사용자·자산 수 증가에 따른 SaaS 좌석비가 없다.
5. **한국어·내부 연계:** 회사 용어와 내부 AI/봇·운영 체계에 맞춰 빠르게 변경할 수 있다.

### 단점과 위험

1. **현장 입력 UX:** QR/바코드 카메라 스캔과 오프라인 동기화가 없어 재물조사 효율이 상용 선도 제품보다 낮다.
2. **하드웨어 추적:** RFID, BLE, GPS, 차량 gateway와 중장비 telemetry가 없다.
3. **제품 운영 책임:** 패치·가용성·백업·경보·온콜·교육·사용자 지원을 회사가 직접 책임져야 한다.
4. **생태계:** HR/ERP/전자결재/MDM용 완성 커넥터와 앱 마켓이 상용 제품보다 적다.
5. **시험 격리:** 공유 로컬 DB의 잔존 승인정책이 시험 한 건을 오염시켰다. CI는 새 DB를 사용하지만 개발자 로컬 전체시험도 이를 강제해야 한다.
6. **운영 자격 증거:** 제품 기능은 운영 중이지만 P7 장기 SLO·경보·off-site 복원·온콜·최종 인수는 아직 완료되지 않았다.

## 5. 권고안

### 결론: 코어는 유지하고 현장 수집을 보완한다

현재 SQCM-i를 폐기하고 범용 제품으로 전환할 근거는 부족하다. 회사 맞춤 승인·감사·비용 통제를 다시 구현하거나 상용 제품을 크게 커스터마이징해야 하기 때문이다. 다음 순서가 비용 대비 효과가 높다.

1. **즉시:** 개발자 전체시험을 항상 격리 DB에서 실행하도록 고정하고 실제 Defender EICAR 검증을 별도 증거로 닫는다.
2. **1순위 제품 보완:** 모바일 카메라 QR/바코드 스캔, 라벨 출력, 엑셀 대량 등록을 추가한다.
3. **2순위 현장 보완:** PWA 오프라인 조사 패킷, 재연결 동기화, 충돌·중복 검증을 추가한다.
4. **3순위 연동:** 인사 퇴사자 회수, ERP/전자결재, webhook/API를 우선 연결한다.
5. **조건부 도입:** 중장비·차량 GPS/BLE가 실제 요구사항이면 Hilti ON!Track 또는 EZO를 연동하고, 대규모 오프라인 RFID 실사가 필요하면 이주데이타형 RFID 모듈을 비교 PoC한다.

### 구매·연동 의사결정 기준

- 사무 비품·노트북·현장 공용품과 회사 승인/감사: **SQCM-i 유지**
- SW 라이선스·PC agent 자동수집: **SAMQ 또는 SMPLY 연동/비교**
- QR 기반 빠른 SaaS 도입만 필요한 별도 조직: **SELLEASE 또는 Sortly 비교**
- 대규모 RFID 오프라인 실사: **이주데이타 PoC**
- 중장비·차량·센서·안전 자격: **Hilti ON!Track/EZO PoC**

## 6. 추가 확인 질문

- 현장 재물조사 대상 중 QR만으로 충분한 비율과 RFID/GPS가 필요한 자산 수는 얼마인가?
- 현장 인터넷 단절 시간이 실제로 얼마나 길며, 오프라인 조사 후 충돌 정책은 누가 승인하는가?
- 더존/ERP·전자결재·인사 계정 중 가장 먼저 연결해야 할 정본은 무엇인가?
- 직접 운영 인력비와 상용 SaaS 연간비용을 같은 3년 TCO 기준으로 비교했는가?

## 7. 근거와 한계

### 로컬·운영 근거

- 현재 코드와 검증 명령: `package.json`, `AGENTS.md`, `npm.cmd run check`, `npm.cmd run check:full`, `npm.cmd run ui:contract`, `npm.cmd run deploy:smoke`, `npm.cmd run maintenance:check`
- 현재 상태 정본: `docs/current-state.md`, `docs/roadmap.md`, `agent docs/harness/MASTER_ROADMAP.json`
- 제품 공백 정본: `docs/maintenance.md`
- Production 대상: `https://inventory.safe-link.co.kr`

### 공식 시장 자료

- [SAMQ 공식 제품](https://www.samq.co.kr/)
- [SELLEASE 공식 제품](https://landing.sellease.io/ko)
- [SMPLY 공식 가격](https://www.smply.one/pricing)
- [이주데이타 RFID 자산관리](https://www.ejudata.co.kr/solution-asset.html)
- [Snipe-IT 제품](https://snipeitapp.com/product), [Snipe-IT 가격](https://snipeitapp.com/pricing)
- [Sortly 가격·기능](https://www.sortly.com/pricing/)
- [Asset Panda 모바일 감사](https://www.assetpanda.com/solutions/mobile-audit/), [공식 가격 도움말](https://prohelp.assetpanda.com/pricing)
- [EZO 가격·기능](https://ezo.io/ezofficeinventory/pricing/)
- [Hilti ON!Track](https://www.hilti.com/content/hilti/W1/US/en/business/business/equipment/on-track.html)

가격은 2026-09-04 공개 페이지 표시값이며 프로모션, 부가세, 최소 사용자·자산 수, 지원, SLA, 데이터 소재지, 하드웨어와 구축비는 계약 전 다시 확인해야 한다. 공급자 공개자료는 실제 서원토건 데이터로 수행한 PoC나 보안감사를 대신하지 않는다.
