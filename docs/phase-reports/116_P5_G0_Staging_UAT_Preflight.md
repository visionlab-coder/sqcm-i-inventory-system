# P5-G0 Staging UAT Preflight 결과

기준일: 2026-08-31

결과: **PASS / UAT 19개 READY·19개 NOT RUN / P5 진행 중**

## 체크리스트

- [x] Harness 상태·계약·G0 자동 검증 PASS
- [x] staging provider OIDC 200, health/readiness 200, 보호 route 401
- [x] frontend/backend/database 정확히 3서비스 healthy
- [x] ADMIN·MANAGER·USER application user 각각 1명·ACTIVE
- [x] 확인된 Supabase Auth 사용자와 OIDC identity 각각 1:1
- [x] 역할 범위 `ALL / ORGANIZATION / DEPARTMENT` 일치
- [x] 회사 CA와 `rejectUnauthorized=true`로 DB 인증서 검증
- [x] `P5-UAT-` 조직·부서·자산·요청 충돌 0
- [x] audit `request_id`·`ip_address`와 추적 인덱스 2/2
- [x] Critical·High 정의와 필수 결함 필드 고정
- [x] 19개 항목 모두 `READY_NOT_RUN`; PASS 추정 0
- [x] 보호 listener 1234·11434·18765·18766·18767 PID 보존

## 실행 계약

실제 fixture는 `P5-UAT-YYYYMMDDTHHMMSSZ` run ID와 합성·비식별 값만 사용한다. 모든 생성 데이터와 audit evidence는 run ID와 request ID로 추적한다. 정리는 증거 확보 후 정확한 run ID allowlist만 대상으로 하며 broad delete를 금지한다.

Critical은 인증 우회·조직/부서 노출·원장 손상·복구 불가, High는 승인·대여/반납·구매·감사 핵심 흐름 실패다. 하나라도 열리면 Production은 계속 NO-GO다.

첫 두 DB 연결 실패는 연결 문자열의 `sslmode`가 명시 CA를 덮어써 `SELF_SIGNED_CERT_IN_CHAIN`이 발생한 것이며, SSL 쿼리 옵션을 제거하고 동일 CA·강제 검증을 적용한 마지막 시도에서 읽기 전용 조회가 통과했다. 인증서 검증 완화는 하지 않았다.

다음 READY는 `P5-G1-STAGING-UAT-EXECUTION`이다. 실제 staging 업무행과 외부 provider receipt가 생기므로 이 G0 결과만으로 UAT PASS·P5 signoff를 선언하지 않는다.
