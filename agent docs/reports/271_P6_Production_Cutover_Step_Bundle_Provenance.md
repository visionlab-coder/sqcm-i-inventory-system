# ACC-P6-80 Production Cutover Step Bundle Provenance

기준일: 2026-09-03

## 결과 / 상태

- [x] 12 Gate 정상 14개와 containment 2개 step의 전이 로컬 의존성 bundle 계산
- [x] gate·step ID와 source byte를 결합한 step별 SHA-256 고정
- [x] child 실행 직전·직후 동일 bundle 재검증
- [x] receipt·checkpoint·resume·actual evidence에 동일 manifest SHA-256 연결
- [x] symlink/reparse·저장소 이탈·과대 파일·비정상 UTF-8 fail-closed
- [ ] 실제 변경창 cutover·DNS/TLS·역할 UAT·서명

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | P6 cutover 실행 코드의 step bundle provenance만 강화 |
| 산출물 | PASS | 정상 14개·containment 2개, 총 16개 step bundle manifest |
| 검증 | PASS | focused 43 PASS·1 SKIP, 전체 847 PASS·8 SKIP |
| 보안 | PASS | 물리 파일·저장소 경계·4MiB/file·64MiB/step·fatal UTF-8 검사 |
| 추적성 | PASS | 구현 `80cd7af`, GitHub quality `33648501041` |
| Git·Rollback | PASS | exact 구현 11파일, 기존 12 Gate·14 정상 step 계약 보존 |
| 외부 Gate | WAIT | 승인 변경창·자격증명 reference·실제 역할/서명 필요 |

## 검증 증거

- failure-first → bundle 준비 실패가 receipt root 전에 차단되지 않음, child 전후 bundle 변경 미탐지, receipt의 bundle SHA 누락 등 3건 재현
- 최소 수정 → relative ESM import를 재귀 추적하고 `gate:id:stepDigest` 정렬 manifest를 생성
- 실행 결합 → process runner가 spawn 전후 expected step digest를 확인하고 변경 시 `CUTOVER_CHILD_BUNDLE_CHANGED`로 중단
- 재개 결합 → checkpoint·현재 manifest 불일치와 pre-signoff receipt bundle 불일치를 route-disable 필요 상태로 차단
- 실제 증거 결합 → 모든 receipt가 하나의 동일한 64자리 bundle SHA-256을 가져야 actual evidence 조립 가능
- focused 6개 파일 → 44 total·43 PASS·1 Windows SKIP·0 FAIL
- 구문 검사 → 414/414 PASS
- 단위시험 → 855 total·847 PASS·8 SKIP·0 FAIL
- `npm.cmd run harness:verify` → PASS
- GitHub-hosted quality run `33648501041` → completed successfully

## 미완료 / 외부 Gate

- 실제 child, DNS/TLS, 역할별 UAT, 서명과 P7 운영 활성화는 실행하지 않았다.
- 실제 cutover는 2026-09-11 20:00~23:00 KST 변경창과 기존 exact confirmation·자격증명 계약을 모두 요구한다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
