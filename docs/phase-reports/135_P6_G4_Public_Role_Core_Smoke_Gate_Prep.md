# P6 G4 공개 역할 Core Smoke Gate 준비

기준일: 2026-09-01 18:30 KST

## 결과

기존 역할 core smoke 실행기의 loopback 성공이 실제 Production 역할 증거로 보일 수 있던 판정 공백을 닫았다. 기본 실행은 loopback 기준선만 만든다. `--public`은 승인 변경창과 exact 확인 문자열이 모두 맞을 때만 `https://inventory.safe-link.co.kr`의 ADMIN·MANAGER·USER MFA/RBAC 시험을 실제 Production Gate로 판정한다.

## 7범주 체크리스트

1. [x] 목표·범위: 공개 MFA/RBAC 역할 스모크의 target·판정 경계만 보완했다.
2. [x] 산출물: 공개 target selector, 실행기 분기와 회귀 테스트를 추가했다.
3. [x] 시험: target 회귀 6/6, orchestrator 회귀 5/5, 구문 180개, 전체 단위 220/220이 PASS했다.
4. [x] 보안: 변경창 밖 공개 실행과 확인 문자열 없는 실행을 차단하고 Secret 원문을 기록하지 않는다.
5. [x] 추적성: P6 증거·MASTER_ROADMAP·현재 상태·로드맵을 같은 사실로 동기화했다.
6. [x] Git·Rollback: 코드·테스트·문서만 변경했고 외부 상태 변경은 없다.
7. [ ] 외부 Gate: 실제 공개 역할 스모크는 사용자 3명·credential reference·DNS/TLS 게시 후 변경창에서 실행해야 한다.

## 판정

- loopback 역할 core smoke: credential reference 대기, 실제 Production NOT_RUN
- 변경창 밖 `--public`: 종료코드 1 차단 PASS
- 실제 공개 Production MFA/RBAC: NOT_RUN
- P6: 진행 중, Production NO-GO
