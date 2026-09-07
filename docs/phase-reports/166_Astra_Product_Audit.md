# Astra 제품 감사 — R4 후보 검증 완료 / R5 출시·인수 승인 게이트

## 현재 정본: R0~R4 5/6, R5 진행

### R5 실행기 로컬 작업 — 2026-09-07

- [x] 목표·범위: 과거 P6 실행기는 변경하지 않고 R5 전용 순서 제어 모듈 작성.
- [x] 산출물: `src/operations/r5-deployment-executor.mjs`, 대응 단위테스트.
- [x] 승인 경계: 후보/CI/대상/변경창 불일치 시 실행 차단.
- [x] 데이터·복구: 공개 전 오류는 복귀, 공개 후 불확실성은 신규 데이터 보존 및 쓰기 차단; 이전 DB 자동 덮어쓰기 금지.
- [x] 검증: 합성 주입 driver 단위테스트 10 PASS/0 FAIL, 명령 종료 0. 실제 Docker 검증으로 승격하지 않음.
- [ ] 실제 실행: 제한 시간 있는 Docker driver 연결 및 격리 실패 복귀 검증 미완료.
- [ ] 출시·인수: Production 배포 및 직원 UAT 미실행. R5 완료 아님.

다음 작업 순서: Docker driver 격리 검증 → 유효 승인 변경창 내 후보 배포 → 사용자 실제 업무 UAT → 출시·인수 증거. 기계 증거 `R5_EXECUTOR_LOCAL_EVIDENCE.json`. 현재 승인은 재요청하지 않으며 변경창 밖 실행으로 확대하지 않는다.

R5 최신: 사용자 `배포하시오`로 2026-09-07 12:30~14:00 KST, cutoff13:30, 기존 AI PC Production/후보eab1ed7 쓰기 차단·복귀 계획 승인. 그러나 실제 실행기는 과거 P6 후보/9월3일 확인 코드에 결박되어 있어 **HOLD_EXECUTOR_TARGET_MISMATCH**. 예약 전에 이 실행 연결을 확인하지 못한 준비 공백이다. 운영 중단·DB 변경·이미지 교체 없음. 추가 승인 부족으로 보고하지 않는다. 다음 READY `R5-VERIFIED-DEPLOYMENT-EXECUTOR`: 현재 승인 입력을 소비하는 실행/실패 복귀 경로를 검증한 뒤 변경창 안에서만 실행. 기계 증거 `R5_DEPLOYMENT_APPROVAL_AND_PREFLIGHT.json`.

후보 SHA `eab1ed72584c300174b67eca344f127a476be528`, 원격 quality `34077115778` SUCCESS. 같은 SHA 이미지에서 Excel Chrome11/DB4, 인증 Chrome13/통합2, 업무3·수리1·비용4 및 별도 DB 백업 복원 PASS. 기본 HTTP7은 실행마다 중복되므로 합산하지 않는다. 전체 회귀995 PASS/8 SKIP/0 FAIL. 혼합 인증/업무 시험은 합성 비밀번호 변경으로 실패하여 새 DB로 분리했고 잘못된 조합은 시작 전 차단한다. 소스/API mock 없는 이미지 실행이며 직원 UAT가 아니다.

R4 완료 체크리스트(7범주):

- [x] 목표·범위: 통합 검증 및 배포 후보 범위 충족, 실제 배포 제외.
- [x] 산출물: exact SHA 이미지 ID와 명령·결과를 `R4_FINAL_CANDIDATE.json`에 연결.
- [x] 시험: CI·회귀·이미지 브라우저·권한 역조건·업무/복원 확인.
- [x] 보안: 합성 데이터만 사용, 운영/Secret 변경 없음.
- [x] 추적성: R 트랙 큐·현재 상태·로드맵 동기화; P7 별도 유지.
- [x] 복구: image-only 불가 명시, 백업 복원 검증, 사용자 dirty 제외한 exact-allowlist 체크포인트.
- [x] 남은 Gate: R5 정확한 후보·대상·유효 변경창·쓰기 차단/재조정 승인 및 실제 직원 UAT.

다음 READY `R5-EXACT-CANDIDATE-DEPLOYMENT-AND-UAT-APPROVAL`. 확인한 9월 3일 P6 승인 변경창은 이번 후보에 재사용하지 않는다. 제안: 승인된 변경창 동안 쓰기를 차단하고 사전 DB/정적 파일 백업, migration, 로그인·핵심 업무 smoke 후 해제. 실패 시 후보 DB는 보존하고 구 DB 복원본·구 이미지·보존 정적 파일로 복귀. 신규 쓰기 허용 후 과거 백업의 자동 덮어쓰기는 금지한다. 이 제안은 실제 실행 승인이 아니다.

아래 기록은 과거 경과다. 운영 P7 7/8과 C5 G4 5항목 입력은 별도이며 전체 Goal 완료 아님.

## 최신 단계 카드

### R4 현재 진행

최신: 메뉴 전환 경합 **2개 실패 재현 → 소스 수정**. 늦은 성공/실패가 새 화면을 덮어쓰던 문제를 navigation revision으로 차단했다. 인증 컨텍스트 GET은 세션 경계만 적용하고 변경 요청 결과는 취소로 오인하지 않는다. 중간 회귀(로그아웃 CSRF 갱신 차단)를 수정한 뒤 단위/세션7 PASS, 전체995 PASS/8 SKIP/0 FAIL, 실제 응답 지연 Chrome+Excel11·HTTP7·DB4 PASS. 증거 `agent docs/harness/R4_NAVIGATION_RACE.json`.

기존 후보 `6a16e36`에는 이 수정이 없어 **신규 출시 후보로는 대체 필요**. 다음 READY `UPDATED_SHA_CI_IMAGE_AND_FINAL_ACCEPTANCE`. 운영/staging 미변경, 실제 직원 UAT 미실행, R4 진행/전체4/6 유지.

최신 후보 `6a16e36` 확정: 동일 SHA Git archive 이미지 2개 및 revision label 검증, 원격 quality `34076470560` SUCCESS. 이미지 자체 API/DB 비용4·업무3·수리1 및 backup restore PASS, Chrome 초기 비밀번호/MFA12·인증통합2 PASS. Excel 브라우저는 처음 두 번째 탭 초기 로딩/이동 대기에서 timeout; 시험기가 로딩 placeholder를 초기화 완료로 인정하던 조건을 보완한 재실행은 Chrome10·Excel DB4 PASS. 각 실행 기본 HTTP7은 중복 합산하지 않는다. `npm.cmd run check` 구문484·단위992 PASS/8 SKIP/0 FAIL.

이 시험기 보완은 **사용자가 로딩 중 다른 메뉴를 누르는 경합이 안전하다는 증거가 아니다**. 다음 READY `R4-CONCURRENT-NAVIGATION-REPRODUCTION`으로 지연 응답의 화면 덮어쓰기 여부를 결정론적으로 확인한다. R4를 성급히 완료하지 않는다. 이미지 CI·순차 흐름 검증 증거는 `agent docs/harness/R4_FINAL_CANDIDATE.json`.

최신 대체 경로: `--repair --backup-restore` **종료 0**. 이전 이미지로 합성 baseline 생성 → 메모리 내 pg_dump → 후보 migration 30개 및 HTTP 7/수리 통합 1 PASS → 새 `r4_restore` DB에 psql 오류 중단 복원 → 이전 이미지 자동 migration/seed 없이 healthy·로그인 PASS. `assets/workflow_requests/asset_cost_events/schema_migrations` 4개 테이블 전체 행 hash·건수 일치, 업그레이드 DB도 hash 일치로 보존 확인. 모든 테이블 의미 대조나 실제 운영 복구로 확대하지 않는다. 기존 image-only 실패는 해결됐다고 삭제하지 않는다.

- [x] 별도 합성 DB 백업 복원 경로 실제 검증.
- [x] 운영·staging 미변경, Secret/덤프 원문 미출력, 시험 3서비스만 정리.
- [ ] 다음 READY `CI_VERIFIED_EXACT_SHA_CANDIDATE_FINALIZATION`: 성공한 CI SHA로 최종 이미지 정체성 고정.
- [ ] R5 전환 계약: **제안**은 백업 직전부터 핵심 smoke 통과까지 쓰기 차단, 실패 시 신규 DB를 보존하고 사전 백업 DB+구 backend+보존 frontend 파일로 복귀. 쓰기 허용 뒤에는 자동 과거 DB 복원을 금지하고 신규 데이터 재조정/forward recovery 승인 필요. 실제 쓰기 차단·복귀 대상/변경창은 별도 확정하며 이 문단은 실행 승인이 아니다.

검증 기준선 `63006f8` 원격 quality `34076249471` SUCCESS도 확인했다. 실행기 변경의 새 체크포인트 CI는 별도다.

최신: 원격 quality `34075788038` / SHA `97808560d14d34a2f736271353d2166c46c73f77` **SUCCESS**. 격리 이미지-only backend 롤백은 **FAIL**: 이전 migration 25개 기대, 후보 DB 30개 적용으로 `MIGRATION_TARGET_MISMATCH`. 진단 보완 후 동일 원인 확인까지 2회이며 같은 경로 재시도 중단. 아래 과거 진행 상태보다 이 문단이 우선한다.

- [x] 원격 quality 성공 확인 및 실제 실패 원인 식별.
- [x] 운영·staging 미변경, migration 검증 우회 없음.
- [ ] READY `ISOLATED_PRE_MIGRATION_BACKUP_RESTORE_REHEARSAL`: 구 스키마 합성 baseline → 사전 backup → 후보 migration → 별도 격리 restore → 구 이미지 로그인·데이터 대조.
- [ ] 전환 후 신규 데이터의 write-freeze/재조정 계약. 백업 복원 시 신규 데이터 유실을 숨기지 않는다.
- [ ] CI 검증 exact SHA 후보 이미지 최종 생성. R4 완료 및 운영 배포 아님.

기계 증거: `agent docs/harness/R4_ROLLBACK_SCHEMA_GATE.json`.

원격 quality 재개: 승인된 작업 branch 하나만 quality push 대상에 추가(`9780856` 원격 일치), 기존 고정 Action SHA·contents:read·GitHub-hosted·합성 자격증명 유지, release workflow 변경 없음. 계약 단위 4 PASS. 실제 run `34075788038` 시작, unit의 check/운영계약/compose/hygiene steps 성공, 3계층 통합은 진행 중. 다음 실행은 같은 run을 조회하며 중복 실행하지 않는다. 앱·Docker 입력은 기존 후보 `69b3cb6`와 Git diff 0이지만 최종 이미지 SHA 검증은 별도다.

- [x] 후보 이미지 자체 Chrome+Excel 10/HTTP 7/Excel DB 4 PASS, 별도 Chrome+초기 비밀번호·MFA 12/HTTP 7/인증 통합 2 PASS. 두 실행 종료 0, 소스 마운트·API mock 없음.
- [x] 운영 보존 정적 파일 3개를 기존 frontend 이미지의 network-none 시험 컨테이너에 복원하고 hash 일치. 파일 복원만 검증했으며 DB/전체 서비스 rollback 아님.
- [ ] 후보 SHA 원격 quality: 공개 Actions API 조회 결과 run 없음. quality.yml push는 main만 대상으로 하므로 feature branch push는 quality 증거가 아니다. gh CLI 미설치; 임의 설치/Secret 사용/dispatch는 하지 않았다.
- [ ] 다음 `CANDIDATE_REMOTE_QUALITY_AND_ROLLBACK_COMPATIBILITY`. 운영 배포·직원 UAT는 아직 아님.

증거 `agent docs/harness/R4_BROWSER_RECOVERY.json`. 테스트별 결과는 별개이며 중복 기본 HTTP 항목을 합산해 새 기능 수로 보고하지 않는다.

- [x] `69b3cb6` Git archive의 좁은 추적 파일만 추출하여 두 후보 이미지 빌드 종료 0. context 환경파일 0; 사용자 dirty 제외.
- [x] image revision 라벨 일치, ID는 `R4_CANDIDATE_IMAGES.json`에 고정.
- [x] 이미지 ID를 사용하고 소스 마운트를 제거한 3서비스 격리 실행: HTTP 7·비용 4·업무 3·수리 1 PASS, 종료 0.
- [ ] 다음 `CANDIDATE_BROWSER_AND_RECOVERY_REHEARSAL`: 이미지 브라우저 검증과 운영 복구본 복원 검증. 아직 R4 완료·운영 배포 아님.

보존본 대비 삭제/변경 코드는 세션·Excel·실사·비용 수정이며 초기 비밀번호 markup은 유지된다. CSS 반응형 변경은 이미지 브라우저 검증 전이므로 전반적 UI 호환성 통과로 확대하지 않는다.

- [x] Production frontend writable-layer의 app.js/index.html/experience.css 변경 재확인.
- [x] 저장소 밖 production runtime evidence의 `r4-frontend-recovery-990c902da425430c8fe723cb761e422e`에 정확히 3개 파일 복사; 실행 중 파일과 SHA-256 일치.
- [x] `.dockerignore`에 루트/중첩 `.env.*` 제외 추가, 집중 단위 1 PASS. 이전 `.env` 단일 제외만으로는 staging/local 변형을 제외하지 못했다. 실제 Secret 유출을 확인한 것은 아니다.
- [ ] 후보와 운영 수정 내용의 의미·회귀 대조. line diff만으로 호환 판정하지 않는다.
- [ ] exact Git SHA 후보 이미지 빌드 및 격리 검증·복구 리허설.

증거 `agent docs/harness/R4_FRONTEND_RECOVERY.json`. 복구 파일은 Git에 올리지 않았으며 컨테이너 변경/재시작은 하지 않았다. 다음 `RUNTIME_PATCH_COMPATIBILITY_AND_EXACT_SHA_BUILD`.

R0~R3 **4/6 로컬 작업 단계 완료**, R4 진행, R5 외부 게이트. 운영 P7 7/8은 별도다. 로컬 완료는 배포·직원 UAT 완료가 아니다.

- [x] 목표·범위: Excel 복구, 현장 실사, 셀프서비스, 이력·비용의 기존 업무 강화.
- [x] 산출물: 기존 코드 수정 및 `R3_ACCEPTANCE.json` 실제 증거 연결.
- [x] 검증: 종합 격리 HTTP 7/C4 6/Excel 4/비용 4/업무 3/수리 1 PASS; 별도 Chrome+Excel 실행 PASS, 종료 0.
- [x] 보안: 운영·staging·외부 공급자 변경 없음, 합성 데이터만 사용.
- [x] 정본: 고도화 큐·본 보고서·현재 상태·로드맵 동기화.
- [x] 복구: exact allowlist 체크포인트, 사용자 변경 제외. 이 카드의 완료 확정은 동일 실행 commit·push 검증 후다.
- [x] 잔여: R4 후보 SHA/이미지·기존 운영 writable-layer 보존·rollback, R5 승인 배포/실제 UAT, P7/C5 외부 게이트 명시.

종합시험 첫 실패는 reference 첫 부서를 직원 부서로 가정한 fixture 의존성이었다. 실제 직원 부서로 고정 후 전체 묶음 통과. 다음 READY는 `CANDIDATE_MANIFEST_AND_RUNTIME_PATCH_PRESERVATION`; 운영 화면의 이미지 외 수정 보존 전 재배포하지 않는다.

## 장기 Goal 단계 체크리스트

### R3 비용 근거·범위 — 진행 중

예상/실제 비용 경계 보완: 승인 생성 경로가 `estimatedCost`를 실제 비용에 복사하던 동작을 제거했다. 예상 99,999원은 요청 payload에 보존하고 수리 건 cost는 NULL이며, 실제 비용 명시 입력 후 TCO 증가 12,345원을 실제 격리 HTTP/DB로 확인했다. 상태만 바꿀 때 기존 미분류 값을 자동 원장 편입하지 않는다. UI는 예상액·미확인 과거 비용 제외와 결제 완료가 아님을 설명한다.

- [x] 확장 `--repair` 통합 1 PASS + HTTP 기본 7 PASS, 종료 0. 첫 fixture의 부서 누락으로 권한 거부 후 같은 직원 부서로 수정해 통과.
- [x] 전체 `check` 989 PASS·8 SKIP·0 FAIL; 렌더 함수의 비용 설명 계약 포함.
- [ ] 다음 `R3_CONSOLIDATED_ACCEPTANCE_REVIEW`: Excel·실사·업무 이력·비용의 기존 증거를 요구사항에 대조하고 R4 진입 여부 결정.

과거 운영 비용 재분류·backfill·배포·직원 UAT는 하지 않았다. 승인 생성 시 예상액을 실제 지출로 간주하지 않는 의미 경계를 유지한다.

최신 수정: 수리 상태 API를 `repair-service`로 분리해 행 잠금·부서 권한·비용 원장·감사를 한 트랜잭션에 묶었다. 생략 비용/처리 내용은 보존, 명시적 0은 반영, NULL 등 모호한 금액은 거부한다. 같은 수리 ID의 이벤트는 중복 합산하지 않는다.

- [x] 단위 2 PASS, 격리 HTTP/DB 통합 1 PASS 및 기본 HTTP 7 PASS.
- [x] TCO API 증가 12,345원·비용 보존·0원·원장 단일성·감사 SQL 실패 시 전체 rollback 검증.
- [x] 전체 `check`: 989 PASS·8 SKIP·0 FAIL.
- [ ] 다음: 승인 시 수리 생성 경로와 화면 비용 설명 검토. 과거 운영 비용 일괄 보정·배포·직원 UAT는 NOT_RUN.

증거: `agent docs/harness/R3_REPAIR_STATUS_FIX.json`. 아래 GAP 기록은 수정 전 재현 증거이며 전체 생성 경로까지 해결했다고 확대하지 않는다.

수리비 검증 **GAP_CONFIRMED**: `--repair-probe` 격리 PostgreSQL에서 수리 건 12,345원 저장 후 TCO 수리비 증가 0원(기대 12,345원). 상태 변경 route의 비용 생략→NULL SQL도 기존 비용을 없앰을 확인했다. 실제 운영/HTTP 수리 쓰기는 실행하지 않았다. 진단 종료 0은 제품 PASS가 아니다.

- [x] 수리 원장과 TCO 간 누락 및 비용 생략 시 손실 반례 확보 (`R3_REPAIR_COST_GAP.json`).
- [ ] `REPAIR_COST_TRANSACTION_AND_PRESERVATION_FIX`: 생략 비용 보존, 비용 이벤트·감사 트랜잭션 연결 및 실제 HTTP 회귀.

이 항목은 미해결이므로 R3 완료·R4 승격을 하지 않는다.

- [x] `--workflow` 격리 실행: 배정·2단계 승인·반납 통합 3 PASS, HTTP 기본 7 PASS, 종료 0. 감사 행위자·순서, outbox, 자산 상태 이력·요청 연결, 중복 승인 거부를 확인했다.
- [x] 초안 outbox를 기대한 시험 가정 1회 실패 후 코드 확인: 초안은 감사만, 제출부터 발행. 제품 발행 경계는 변경하지 않았다.
- [ ] 다음 READY: `REPAIR_COST_PROVENANCE_AND_EXPLANATION` — 수리 처리에서 비용 원장·설명까지 연결 확인. 브라우저·직원 UAT·운영 배포 NOT_RUN.

기계 증거: `agent docs/harness/R3_WORKFLOW_EVIDENCE.json`. 변경은 실행기·통합시험·상태 문서뿐이며 운영 프로세스와 데이터를 변경하지 않았다.

R2 로컬 수정은 `2383fed` 원격 체크포인트로 완료(3/6 R 단계; 운영 반영은 별도).

- [x] `/cost/roi`가 resolveScope를 전달하지만 조직 전체 거래처·예산과 자산 미연결 절감액을 부서 사용자에게 반환하는 반례 확인: 신규 시험 FAIL.
- [x] 부서 제한에서는 귀속 가능한 절감액만 포함하고 조직 집계 조회를 생략하도록 최소 수정. 집중 3/3·전체 984 PASS·8 SKIP·0 FAIL.
- [x] 실제 격리 DB: 부서 소유·미귀속 제외·조직 집계 제한·조직 기준선 4 PASS. 기본 HTTP 7 PASS, `node scripts/r0-authenticated-isolated-check.mjs --cost` 종료 0.
- [x] 화면의 데이터 없음·권한 제한·조회 실패를 구별: 실제 렌더 함수 단위 3 PASS. 브라우저 및 직원 UAT는 NOT_RUN.
- [x] `npm.cmd run check` 종료 0. 기계 증거: `agent docs/harness/R3_COST_SCOPE_EVIDENCE.json`.
- [ ] 업무 이력·비용 근거 나머지 경로 확인 및 체크포인트. 운영·staging 변경 없음.

### R2 로그인 준비 경쟁 상태 — 로컬 수정, 검증 진행

R1 구조 결정은 `16257a7` 동일 branch 원격 체크포인트로 완료. R 단계 2/6, 현재 R2(운영 진행률과 별도).

- [x] 실제 app.js 이벤트 핸들러의 지연 CSRF 반례: 기대 로그인 요청 0, 실제 1로 실패.
- [x] logout 후 기존 CSRF 폐기, 진행 중 준비 Promise 대기, 준비 실패 시 다음 제출에서 재발급하도록 보완.
- [x] 집중 1/1 및 전체 `npm.cmd run check` 종료 0, 982 PASS·8 SKIP·0 FAIL.
- [x] 준비 실패 시 전송 0·다음 제출 새 CSRF 복구: 집중 2/2 PASS. 전체 983 PASS·8 SKIP·0 FAIL. 격리 `--browser --lifecycle` 종료 0: Chrome 12/12·HTTP 7/7·인증 통합 2/2 PASS.
- [x] R2 exact allowlist 체크포인트 `2383fed2801926cbf1dca973c47c46729ec17fdc`, 원격 동기화 확인. 운영·staging 변경 없음.

R2 로그인 준비 수정의 검증 범위는 로컬이다. 다음 R3는 생애주기 추적·비용 판단의 실제 소비 경로와 근거를 확인한다. 새로운 직원 사용 효과나 운영 적용은 주장하지 않는다.

### 현재 단계 요약 — R0 감사 완료 / R1 구조 결정

R0는 감사 범위에서 완료(1/6 R 단계). 운영·UAT 완료가 아니며 P7 7/8은 별도다. C4 `0bca821`, Excel `cc765f7`, 인증 `b2aba0f`, 배포 대조 `25ddb56`의 동일 branch push 증거가 있다. 발견한 배포 불일치는 R4/R5 해결 항목이며 숨기거나 감사 실패로 반복 조회하지 않는다.

R0 완료 7범주: [x] 목표/범위 감사 [x] 코드·증거 존재 [x] 단위/격리 DB/HTTP/Chrome 검증 [x] 합성/Secret/외부 경계 [x] 본 보고서·큐 연결 [x] exact Git 체크포인트·dirty 보존 [x] 운영 미배포·UAT·다음 Gate 명시.

R1 결정은 [점진 고도화 ADR](../ADR-ASTRA-INCREMENTAL-MODERNIZATION.md)이다. 전면 교체는 근거 부족으로 제외하고 기존 3계층·API·DB를 유지한다. R1은 결정 문서 검증·복구 체크포인트 진행 중이며 이후 R2 로그인 준비 경쟁 상태를 실제 반례로 점검한다.

### R0 배포 내용 대조 — 2026-09-07 읽기 전용 증거

기준 HEAD `b2aba0f1f1df7b8ada59a86c42a93815d98459f1`, 운영 이미지 tag `38b2bca7f34a7a950469c8d0cd6d2a4b11e3b7a6`.

| 확인 대상 | 운영 | staging | 판정 |
|---|---|---|---|
| frontend/session-boundary.js·offline-stocktake.js | 파일 없음 | 파일 없음 | 최근 계정 격리·오프라인 기능 미배포 |
| services/employee-self-service.js·asset-import-service.js | 파일 없음 | 파일 없음 | C4 셀프서비스·C1 이관 미배포 |
| services/enterprise-service.js | 이미지 tag Git SHA256 일치, HEAD 불일치 | tag·HEAD 불일치 | 최근 C4 동시성 수정 미배포 |
| frontend/app.js | tag·HEAD 모두 불일치 | tag·HEAD 모두 불일치 | 이미지 라벨만으로 내용 확정 불가 |

명령: `docker ps`, 고정 대상 `docker exec ... sha256sum`·`ls`, `git show <ref>:<file>` SHA256, `docker inspect` mount destination, `docker diff`. 운영 frontend bind mount 없음; `docker diff`에서 app.js·index.html·experience.css의 writable-layer 변경 확인. 변경 주체·시각은 이 증거만으로 판정하지 않는다.

운영 app.js SHA256 `4e10cbe7e4b12d0a19f01dcae86623a6378bb82441ac651b2d31e94ee770c51e`; staging `fca708350693c1d5e28e27e2a181e0d72403c79e1d3fd4afa8a6845f90c9f244`. 운영 enterprise-service SHA256 `299e7c95e356444687708aa85c5027286d842187618ce1dd4904bb5550e30a41`.

운영·staging 각각 3서비스 healthy, backend/database host publish 없음. 기존 local frontend 3000은 전체 인터페이스 게시 상태(변경하지 않음). 보호 봇 개별 상태는 이번 NOT_RUN.

**P1 배포 신뢰성 공백:** 검증된 로컬 개선과 실제 서비스가 다르다. R4에서 정확한 Git SHA의 불변 후보를 만들고 파일 manifest로 검증해야 하며, R5 승인된 배포 전 현재 writable-layer 수정의 보존·비교 및 롤백 사본이 필요하다. 현재 태그 이미지만 다시 올리는 작업은 최신 운영 화면 수정을 잃을 수 있으므로 수행하지 않는다. 운영·staging 변경 0.

### R0 초기 비밀번호·MFA — 진행 중

- [x] Excel 체크포인트 `cc765f7` push·동일 원격 SHA 검증 후 인증 감사로 이동.
- [x] `--lifecycle` 격리 실제 HTTP/PostgreSQL 시험 종료 0, 실제 TAP pass 2 확인. 초기 비밀번호 업무 차단·약한 값/재사용 거부·변경 후 접근·이전 비밀번호 거부·감사 기록, TOTP 등록/검증·복구코드 단회성·저장 암호화 검사.
- [x] 초기 변경 화면 자동 표시→업무 API 403→실제 폼 변경→업무 API 200. `--browser --lifecycle` 종료 0, 브라우저 9/9·HTTP 7/7·인증 통합 2/2 PASS.
- [x] MFA 브라우저 등록·challenge 흐름 확인. 실제 폼 등록→logout→새 CSRF→로그인→MFA pending 업무 401→코드 입력→업무 200. 최종 `--browser --lifecycle` 종료 0, 브라우저 12/12·HTTP 7/7·인증 통합 2/2 PASS. 실제 직원 UAT·운영 계정 변경은 NOT_RUN.

시험 중 두 번째 탭 초기화 및 logout CSRF 갱신 대기 공백으로 각 1회 timeout이 발생했다. 앱 준비와 토큰 교체 대기 조건 보완 후 최종 전체 경로 통과. 인증키·복구코드는 출력하지 않았다. 다음은 배포 내용 정본 대조이며 R0 전체 완료는 아직 아니다.

기존 `test/integration/http-smoke.test.js`와 `mfa-auth.test.js`를 재사용하며 실행기는 통과 2건 미만이면 실패한다. 기존 HTTP 7/7도 PASS. 다음 READY 세부 작업은 초기 비밀번호 브라우저 흐름이다.

### R0 Excel 오류복구 — 진행 중

- [x] CSV 닫는 따옴표 뒤 문자를 값에 합치는 결함을 신규 반례로 재현: 9 PASS·1 FAIL.
- [x] 잘못된 따옴표 경계를 오류로 반환하고 수정·재미리보기 안내. 정상 Excel escaped quote·CRLF·셀 내 줄바꿈 유지: 집중 10 PASS.
- [x] `npm.cmd run check` 종료 0: 981 PASS·8 SKIP·0 FAIL.
- [x] 실제 격리 PostgreSQL에서 두 번째 INSERT 후 DB 오류(22012)를 발생시켜 자산·이력·감사·outbox 전체 건수 복원을 확인. 같은 CSV 재시도 2건 성공, 반복 등록 거부 후 건수 불변.
- [x] 합성 CSV 오류 표시·확정 버튼 부재→수정 파일 재미리보기→등록→실제 backend 목록 확인. Chrome/HTTP/DB 연결, API mock 없음. 확정 대화상자만 합성 시험에서 자동 수락.

통합 명령 `node scripts/r0-authenticated-isolated-check.mjs --browser --excel`: 종료 0, 브라우저 10/10·HTTP 7/7·DB 복구 4/4 PASS. 실제 직원 원장/UAT 및 운영 배포는 NOT_RUN이다. 복구 체크포인트 후 다음 로컬 항목은 `R0-INITIAL-PASSWORD-MFA-AUDIT`다.

이번 변경은 `asset-import-service.js` 파서와 단위시험이다. 실제 원장·운영·staging 변경은 없으며 Excel 감사 전체 완료가 아니다.

DB 복구 증거: `node scripts/r0-authenticated-isolated-check.mjs --excel` 종료 0, Excel 4/4·기존 HTTP 7/7 PASS. `scripts/r0-import-postgres-fixture.mjs`는 실행별 신규 `r0_synthetic` DB에서만 실행하며 운영 `.env`를 읽지 않는다. 실제 직원 UAT·브라우저 복구는 이번 NOT_RUN. 다음 세부 READY는 브라우저 오류 수정→재미리보기→등록이다.

2026-09-07 사용자 장기 Goal 실행 요청을 등록했다. 기계 정본은 `agent docs/harness/ASTRA_REMAINING_WORK.json`, 실행 계약은 기존 108이다. R0~R5는 감사/고도화 작업 순서이며 운영 P0~P7 진행률과 합산하지 않는다. 현재 R0 진행 중, R 단계 완료 0/6; 기존 C3 로컬 완료 증거는 보존한다.

| 단계 | 남은 작업 | 상태 / 완료 기준 |
|---|---|---|
| R0 | C4 집계·동시성, Excel 오류복구, 초기 비밀번호/MFA 잔여 검증, 배포 내용 대조 | 진행 중 / 증거와 우선순위 확정 |
| R1 | 현 구조 유지 또는 점진 개편 판단 | 대기 / 호환성·영향·롤백 결정 |
| R2 | 확인된 사용자 영향 결함과 복구 UX 개선 | 대기 / 실패 재현→수정→회귀 |
| R3 | Excel 이전·현장 실사·자산 이력·비용 근거 강화 | 대기 / 승인 업무에 대한 실효 검증 |
| R4 | 통합 테스트·후보 이미지·복구 적합성 | 대기 / 정확한 SHA·검증·Git 체크포인트 |
| R5 | 승인된 배포·직원 UAT·운영 인수 | 외부 게이트 / 실제 승인·실행 증거 |

현재 READY: `R0-EXCEL-IMPORT-RECOVERY-AUDIT`. 직전 C4 로컬 점검 묶음 결과:
- [x] 최근 요청/수리 50건, 알림 20건으로 전체 요약을 계산하던 코드 확인.
- [x] 목록 제한과 무관한 건수 61/52/25 반례 추가 후 실패 재현.
- [x] 조직·사용자 제한을 유지한 별도 COUNT 쿼리로 수정; 집중 4/4 PASS.
- [x] 실제 격리 PostgreSQL에서 목록 상한·완료 상태·다른 사용자 제외 검증: 목록 50/50/20, 전체 요약 61/52/25.
- [x] 배정 조회 직후 해제 반례 실패 재현 후 요청 트랜잭션 내부 재검증·행 잠금 보완. 해제된 배정은 403·INSERT 0건, 동시 해제는 요청 COMMIT까지 대기·감사 1건.
- [x] C4 로컬 점검 묶음 exact allowlist commit·push: `0bca821b3e015f2b1f40b8d9ac8b95330a41c962`, 동일 branch 원격 SHA 일치 확인. R0 전체/운영 완료는 아님.

검증: `node scripts/r0-authenticated-isolated-check.mjs --c4` 종료 0, HTTP 7/7 및 C4 실제 격리 PostgreSQL 6/6 PASS. `npm.cmd run check` 종료 0, 980 PASS·8 SKIP·0 FAIL. 단위 4/4도 PASS. 실제 다른 조직 데이터 검증과 직원 UAT는 이번 NOT_RUN이며 로컬 합성 검증을 운영 승인으로 승격하지 않는다. 운영·staging 배포·migration·직원 계정은 변경하지 않았다. 장기 Goal은 ACTIVE이며 별도 예약 자동화는 생성하지 않았다. 체크포인트 뒤 다음 READY는 `R0-EXCEL-IMPORT-RECOVERY-AUDIT`다.

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
| C3 오프라인 | 오류 분류·계정 격리·멀티탭·조회 경쟁 상태 보완 | 로컬 수정 | 집중 20/20, Chrome 합성 API 16/16, 실제 HTTP/DB 7/7 및 실제 backend 브라우저 7/7 | 미배포 | 미배포 | NOT_RUN | C4 집계·동시성 감사로 이동 |
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

## 후속 실행 — R0-C3-ACCOUNT-SCOPED-OFFLINE-STORAGE

계정·조직·부서·역할별 별도 IndexedDB 이름을 사용하는 불변 저장 핸들을 구현했다. 현재 계정 확인을 작업 전후 수행하고 화면 렌더링·동기화·확정 전에 핸들의 유효성을 확인한다. 구형 소유자 미상 DB는 읽기·이관·삭제하지 않는다. 계정 전환 뒤에도 원래 계정의 미동기화 작업은 원래 namespace에 남는다.

- [x] 모듈과 실제 화면 호출 연결, 서버 인가 계약 유지
- [x] focused 15/15 PASS
- [x] 실제 Chrome IndexedDB 합성 시나리오 13/13 PASS: 사용자·조직 격리, logout, role downgrade, 읽기 중 계정 전환, 대기 작업 보존, 구형 DB 보존
- [x] 구문 468개, 전체 단위 974 PASS / 8 SKIP / 0 FAIL; UI 40 PASS; diff check PASS
- [x] 운영 계정·Secret·운영 DB·컨테이너 변경 없음. 브라우저는 별도 합성 프로필과 loopback 시험 서버만 사용했고 정상 Browser.close로 종료했다. 합성 프로필은 임시 디렉터리에 보존했다.
- [ ] 실제 직원 인증 UI·여러 탭 세션 변경·오프라인 중 서버 권한 회수는 이번 시험 범위 밖. 구형 미동기화 데이터의 소유자 확인·복구 UX도 잔여 항목이다. 저장 namespace는 앱 수준 격리이며 브라우저 프로필 소유자에 대한 암호화 경계가 아니다.
- [!] GitHub get_repo가 repository visibility=public을 확인했다. private remote만 허용한 전역 계약과 충돌하여 push 미실행. 저장소 공개설정을 임의 변경하지 않는다.

시험기 첫 실행은 dump-dom이 IndexedDB 완료 이전 NOT_RUN을 읽어 실패했다. 실제 완료 신호를 CDP로 기다리는 경로로 수정 후 PASS했다. 증거 정본: `agent docs/harness/R0_C3_OFFLINE_SCOPE_EVIDENCE.json`.

## 배포 추적 항목 확인 결과

Production frontend/backend 모두 image tag와 revision label이 `38b2bca7f34a7a950469c8d0cd6d2a4b11e3b7a6`다. 로컬 Git에서 해당 커밋은 `feat(auth): force company users to change initial password (#24)`이며 `93aa5b8…`의 후손이다. 두 SHA 사이 변경은 해당 커밋 1개다. 따라서 더 오래된 버전으로의 회귀라는 근거는 없고 문서 기준이 갱신되지 않은 것이다. 해당 커밋 tree에 `frontend/offline-stocktake.js`는 없다. 실행 컨테이너 파일 전체의 SHA 검증은 아직 하지 않았으므로 label만으로 현재 모든 파일 내용을 보증하지 않는다.

다음 READY: `R0-C3-LEGACY-RECOVERY-AND-SESSION-UI-VERIFICATION`. 구형 데이터를 자동 배정하지 않는 복구 안내 및 공유 기기 세션 전환 화면 검증. R0 전체·운영 Phase·배포 완료는 아님. 공개 remote push에는 기존 private-only 조건과의 충돌을 해소하는 사용자 결정이 필요하다.

## 후속 실행 — 복구 안내·멀티탭 화면 잠금

사용자가 작업 완료 전까지 기존 public 저장소를 유지한다고 명시하여 공개 remote 체크포인트 예외가 승인됐다. 설정을 private으로 바꾸지 않고 동일 작업 branch만 push한다. 앞의 public 충돌 표시는 당시 보류 이력이며 현재 승인 상태가 아니다.

- [x] 재물조사 화면에 구형 데이터 자동 이관 금지, 사이트 데이터 삭제 금지, 관리자 소유자 확인·복구 요청 안내 표시
- [x] BroadcastChannel과 storage fallback으로 다른 탭의 로그인/MFA/초기 비밀번호 변경/로그아웃 성공을 알림. 전송값은 변경 신호 또는 불투명 nonce뿐이며 계정·토큰·업무 데이터 없음
- [x] 수신 탭은 이전 화면·참조 데이터·선택 조사를 비우고 로그인 화면으로 잠금. 이전 세션 revision의 요청 응답은 사용하지 않음
- [x] 초기/일반 로그아웃 이후 CSRF 재조회 실패에도 현재 화면은 잠금 유지
- [x] 새 모듈의 HTML 로드 순서·service worker cache 버전과 정확한 query URL을 함께 갱신
- [x] focused 18 PASS, Chrome 16 PASS(실제 SPA 두 탭 잠금·390px 가로 넘침 없음 포함), 구문 470개, 전체 단위 977 PASS·8 SKIP·0 FAIL, UI 계약 40 PASS
- [ ] 실제 인증 backend와 직원 UAT는 NOT_RUN. 브라우저는 실제 프런트엔드+합성 HTTP 서버이며 이 차이를 완료 증거에서 보존한다.

이번 결과는 C3 로컬 회귀·멀티탭 UI 후보이며 전체 제품 또는 R0 완료가 아니다. 구형 데이터 실제 복구는 원래 소유자와 데이터별 근거 없이는 실행하지 않는다. 다음 READY: `R0-AUTHENTICATED-APP-INTEGRATION-VALIDATION` — 격리 backend에서 합성 직원 인증·재물조사·로그아웃의 실제 HTTP 계약을 대조한다. 운영 배포·migration·회사 계정 변경은 하지 않는다.

## 후속 실행 — 실제 인증 HTTP·PostgreSQL 및 두 가지 회귀 수정

기준선 `c782502b961dd8b858c39886651a12081d1c573a`는 작업 시작 시 원격 동일 branch와 일치했다. 위의 과거 미완료/다음 READY 문구는 이력이며 현재 결과는 이 절과 기계 증거를 따른다.

- [x] 범위: `r0-authenticated-isolated-check.mjs`로 기존 .env·운영 자격증명을 읽지 않는 독립 시험 구현. 기존 이미지 재사용, 새 frontend/backend/database 3서비스, 내부 전용 network, 호스트 공개 포트 0, 임시 메모리 DB, 난수 시험 비밀번호 사용.
- [x] 실제 통합: `node scripts/r0-authenticated-isolated-check.mjs` exit 0, 7/7 PASS. 익명 401, BCrypt 로그인·세션 회전, USER 403, CSRF 누락 403, 담당자 실사 생성/조회, offline APPLIED→DUPLICATE, logout 후 이전 cookie 읽기 401·쓰기 CSRF_INVALID 403 확인.
- [x] 결함 수정: HTML이 로드하는 `session-boundary.js`가 frontend Dockerfile COPY에서 빠진 것을 신규 시험 FAIL로 재현하고 복사 목록에 추가. 실제 이미지 build·배포는 NOT_RUN.
- [x] 결함 수정: `refreshSecurityContext` 응답 중 logout이 발생하면 이전 사용자/CSRF를 복구하던 경쟁 상태를 VM 시험 FAIL로 재현. 응답 전후 session revision 검사로 차단 후 PASS.
- [x] 회귀: focused 20 PASS, 실제 Chrome 16 PASS(합성 HTTP 서버), 전체 단위 979 PASS / 8 SKIP / 0 FAIL, 구문 472개, UI 40 PASS. 실제 backend 인증 브라우저 검증과 혼합하지 않는다.
- [x] 보존: Production·staging·기존 DB·직원 계정 변경 없음. 테스트가 만든 unique Compose project의 label·대상 수를 검사한 뒤 그 임시 컨테이너/network만 정리했다. tmpfs의 합성 시험 데이터는 폐기됐으며 원본 업무 데이터는 대상이 아니다.
- [ ] 잔여: 실제 backend를 사용하는 브라우저 로그인·계정 전환, 직원 UAT, C4 동시성/집계, 후보 이미지 build·배포, C5 실제 provider 입력, P7 운영 인수. 전체 제품 완료로 전환하지 않는다.

실행 중 조정: 읽기 전용 디렉터리 하위 mount 충돌 2회는 개별 파일 mount로 해결했다. internal network의 host port 조회가 `invalid IP:0`이어서 HTTP client를 backend 컨테이너 안으로 이동해 host port 없이 검증했다. logout 이후 쓰기 기대값은 초기 시험에서 401로 두어 실패했으나 실제 middleware는 CSRF가 인증보다 먼저 실행되므로 코드 확인 후 정확한 403/CSRF_INVALID를 검증했다. 보안 기준을 완화하거나 운영 동작을 변경하지 않았다.

다음 READY: `R0-AUTHENTICATED-BROWSER-LIFECYCLE`. 실행 계약 108을 유지하고 이 로컬 HTTP 증거를 실제 직원 UAT로 승격하지 않는다. 체크포인트는 현재 public 유지 승인에 따라 exact allowlist로 동일 branch에 저장하며 원격 SHA 확인은 실행 보고에서 제시한다.

## 후속 실행 — R0-AUTHENTICATED-BROWSER-LIFECYCLE

기준선 `708715bb380ea6eec8a8cc751c268c50c18e139d`. 이번 단위는 테스트·증거만 추가하며 제품 코드·운영 계정은 수정하지 않았다. agent-browser CLI 미가용으로 기존 Chrome CDP 실행 경로를 사용했다.

- [x] 목표/범위: 합성 계정의 실제 로그인 폼 → 실사 메뉴/상세 버튼 → 두 탭 logout → USER 전환을 같은 실제 Nginx·Express·PostgreSQL에 연결.
- [x] 산출물: 기존 격리 실행기에 `--browser` 옵션과 `r0-authenticated-browser.mjs`를 추가. API 응답 mock 없음. loopback 임시 중계만 두며 컨테이너 내부망·host publish 0·fresh tmpfs DB 유지.
- [x] 검증: `node scripts/r0-authenticated-isolated-check.mjs --browser` exit 0. 실제 HTTP 7/7, Chrome 인증 browser 7/7 PASS. 390×844 가로 넘침 없음, logout 후 401, USER 접근 403 포함.
- [x] 보안/보존: 시험 비밀번호는 난수로 생성해 메모리/시험 컨테이너에서만 사용. 출력에 cookie/토큰 없음. 새 Chrome 프로필만 사용·정상 종료했고 개인 브라우저는 미변경. 시험 컨테이너·네트워크만 종료·제거했으며 합성 tmpfs 데이터는 폐기했다.
- [x] 정합성: 기존 보고서·상태·로드맵·기계 증거에 같은 범위 반영. P7 7/8·C5 G4 보류·공개 저장소 유지.
- [x] 회귀/복구: 집중 session/image 5 PASS, UI 40 PASS. 전체 단위 979 PASS·8 SKIP·0 FAIL, 구문 473개. 이전 체크포인트 보존, 현재 exact allowlist checkpoint는 최종 SHA/원격 확인으로 보고.
- [x] 다음 범위: `R0-C4-SELF-SERVICE-COUNT-AND-CONCURRENCY-AUDIT` — 실제 직원 UAT·MFA 전체 생애주기·초기 비밀번호 변경·실제 오프라인 권한 회수·후보 image build/배포는 이번 7항목에 포함하지 않는다.

실행 후 Production/staging 각각 3서비스 healthy. 보호 listener 1234/31896·11434/13620·18766/11460, 18765 없음은 이전 관찰과 같다. 전체 37봇 개별 검증은 NOT_RUN.
