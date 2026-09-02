# ACC-P6-75 Production Ingress Orphan Recovery Preflight

기준일: 2026-09-02

## 결과 / 상태

- [x] tunnel·임시 credential·최종 credential·config·process·public DNS를 한 번에 읽기 관측
- [x] provider tunnel 또는 DNS 관측 실패를 orphan 없음으로 오판하지 않고 fail-closed
- [x] 모든 산출물 부재를 `PASS_NO_INGRESS_PARTIAL_STATE`로 판정
- [x] 일부 산출물만 남은 상태를 `READY_WAIT_INGRESS_PARTIAL_MUTATION_REVIEW`로 판정
- [x] 완전 게시 상태를 orphan과 분리
- [x] 삭제·복구 실행·Secret 원문 읽기 없는 전용 preflight를 Harness 전체 검증에 등록
- [ ] 실제 Production tunnel·DNS/TLS 생성 및 부분 실패 복구 실행

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | ingress 부분 변경 탐지와 복구 판단 준비만 수행 |
| 산출물 | PASS | 순수 판정기·읽기 전용 CLI·failure-first 5건 |
| 검증 | PASS | focused 5 PASS, 전체 826 PASS·8 SKIP |
| 보안 | PASS | Secret content read 0, 삭제·외부 mutation 0 |
| 추적성 | PASS | 구현 `b6197cc`·GitHub quality `33639122565` |
| Git·Rollback | PASS | exact 구현 5파일, 기존 tunnel·DNS·runtime 변경 없음 |
| 외부 Gate | WAIT | 승인 변경창·5개 물리 입력 참조·실제 역할 UAT·서명 필요 |

## 검증 증거

- failure-first → 판정 함수와 CLI 미존재로 5/5 실패 재현
- 구현 후 focused → 5/5 PASS
- 실제 읽기 전용 preflight → `PASS_NO_INGRESS_PARTIAL_STATE`; 관측 6항목 모두 false; 외부 변경 0
- 구문 검사 → 410/410 PASS
- 단위시험 → 834 total·826 PASS·8 SKIP·0 FAIL
- `npm.cmd run harness:verify` → 새 preflight를 포함한 전체 검증 봉투 PASS·exit 0
- GitHub-hosted quality run `33639122565`, commit `b6197cc` → unit·three-tier-integration SUCCESS
- 보호 포트/PID `1234/6632`, `11434/8588`, `18765/22716`, `18766/65724` 보존
- Production Docker → `frontend`, `backend`, `database` 3서비스 healthy; frontend만 `127.0.0.1:3300` 공개

## 미완료 / 외부 Gate

- 실제 orphan tunnel이나 임시 credential은 현재 관측되지 않았다.
- 이 PASS는 실패 후 잔존 상태를 식별하는 준비 증거이며 실제 tunnel 삭제 또는 Production 공개 성공 증거가 아니다.
- 실제 복구 삭제는 별도 exact 대상 확인, 승인 변경창과 명시적 복구 확인 계약 없이는 수행하지 않는다.
- 공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`, 가속 READY는 `ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF`로 유지한다.
