# P7-G1 GitHub public-read 차단요인 축소

기준 시각: 2026-09-03 12:47 KST

## 결과

P7-G1의 운영 개선 큐 수집에서 불필요한 GitHub Secret 의존성을 제거했다. 대상 repository의 public API는 HTTP 200이며 `operations` open Issue는 0건이다. 실제 수집은 triage 책임자 attestation이 없어 실행하지 않았다.

## 7범주 체크리스트

- [x] 목표·범위: P7 개선 큐의 읽기 전용 증거 경로만 보완했다.
- [x] 정본·대상: `visionlab-coder/sqcm-i-inventory-system`, label `operations`를 고정했다.
- [x] 권한: public anonymous GET만 허용하고 Issue 생성·수정은 하지 않았다.
- [x] 보안: anonymous mode에서 token·Secret read를 열지 않는 테스트를 추가했다.
- [x] 실패 우선: 보완 전 신규 테스트 1건 FAIL을 재현한 뒤 최소 수정했다.
- [x] 검증: focused 11/11 PASS, public API HTTP 200, mutation 0건을 확인했다.
- [ ] 실제 export: triage attestation·외부 output·exact confirmation이 없어 `NOT_RUN`을 유지한다.

## 남은 Gate

`P7_IMPROVEMENT_QUEUE_TRIAGE_ATTESTATION_FILE`에 실제 triage 책임자, 승인 receipt, 최근 triage 시각과 7일 이내 다음 triage 일정이 필요하다. 이 입력 전에는 actual 운영 인수 완료로 판정하지 않는다.
