# P6-G4 Harness 활성 브랜치 Provenance 보완

기준일: 2026-09-01

## 결과

- [x] 실제 작업 branch `codex/p6-ai-pc-postgres-production` 확인
- [x] `MASTER_ROADMAP.json`의 과거 branch 값을 실제 branch로 교정
- [x] local symbolic ref와 GitHub Actions head/ref를 공통 정규화
- [x] branch 해석 불가·정본 누락·불일치를 fail-closed
- [x] P6/P7 Phase 상태와 Production GO 판정은 변경하지 않음

## 검증

- `node --test test/unit/harness-branch-provenance.test.js` → 4/4 PASS
- `npm.cmd run harness:check` → PASS, currentPhase P6, completedPhases 6
- 저장소 전체 회귀 → JavaScript 구문 191개, 단위 249/249 PASS
- 실제 외부 변경·Production mutation·Secret 접근 → 0건

## 7범주 체크리스트

1. [x] 목표·범위: active branch provenance 오류만 보완
2. [x] 산출물: pure evaluator, Harness 연결, 회귀와 정본 갱신
3. [x] 검증: focused·repository·Harness 검사
4. [x] 보안: Secret·계정·외부 전송 없음
5. [x] 추적성: Queue·MASTER·현재 상태·로드맵 동기화
6. [x] Git·rollback: 정확한 allowlist, 이전 정본 값은 Git으로 복구 가능
7. [ ] 외부 Gate: P6 공개 변경창·자격증명·최종 서명은 계속 대기

## 다음 READY

`P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`와 가속 큐의 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`를 유지한다. 승인된 변경창 밖에서는 DNS/TLS·계정·운영 활성화를 실행하지 않는다.
