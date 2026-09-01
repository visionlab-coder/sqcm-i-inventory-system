# P6·P7 연속 진행 가속 계약

기준일: 2026-09-01 17:30 KST

## 결과

전체 진행률이 `6/8`에서 멈춘 직접 원인은 반복 테스트 실패가 아니라 P6 공개 전환을 `2026-09-11 20:00~23:00 KST`로 제한한 시간 Gate와 실제 Production 계정·서명 입력 부재다. 기존 장기 메타프롬프트가 P4 진행 상태로 남은 문서 드리프트도 발견했다.

메타프롬프트를 현재 P6 기준으로 갱신하고 외부 Gate를 약화하지 않으면서 다음 자동화 공백을 순서대로 닫는 기계 큐를 추가했다.

## Phase별 체크리스트

### P6 Production 전환

- [x] 배포 후보·CI·불변 이미지
- [x] AI PC loopback Production 3서비스·migration·backup·restore·rollback
- [x] 공개 probe·로그·비기능·운영 health·rollback·서명 preflight
- [x] 실제 역할 MFA·RBAC core smoke runner — Secret 참조 0/3으로 실제 시험은 NOT_RUN, runner·회귀 4/4 완료
- [ ] 인증 사용자 CSRF/idempotency runner — `ACC-P6-02` READY
- [ ] 변경창 12-Gate cutover orchestrator — `ACC-P6-03`
- [ ] 실제 증거 finalizer — `ACC-P6-04`
- [ ] 전용 tunnel·DNS/TLS·실사용자·경보·최종 서명 — 변경창/외부 입력

### P7 운영·유지보수

- [ ] 운영 인수 preflight 검사기 — P6 대기 중 준비 허용, 상태는 미착수 유지
- [ ] 실제 경보 수신·off-site backup·복원훈련·온콜 인수
- [ ] 운영 책임자 최종 서명과 `8/8` 전환

## 실패·대체 해결 규칙

1. `WAIT_CHANGE_WINDOW`, `EXTERNAL_INPUT`, `NOT_RUN`은 실패가 아니다.
2. 동일 실행 실패 1회는 재현 후 최소 수정한다.
3. 동일 실패 2회는 보안·데이터·완료 기준이 같은 대체 구현 또는 공식 도구 경로를 사용한다.
4. 동일 실패 3회는 자동 재시도를 중단하고 원인·영향·복구조건을 기록한다.
5. 공급자·도메인·비용·보안 경계를 바꾸는 대체안은 자동 적용하지 않는다.

## 다음 READY

`ACC-P6-02-AUTHENTICATED-CSRF-IDEMPOTENCY-RUNNER`: 승인된 시험계정이 있을 때 정상 CSRF 쓰기와 동일 idempotency key replay를 검증하고, 입력이 없으면 Secret을 추측하지 않는 fail-closed runner를 구현한다.
