# P4-G1 UAT Auth·Identity Linking 결과

기준일: 2026-08-31

결과: **증거 있는 완료 / P4 G1 전체 READY는 계속 진행 중**

## 체크리스트

| 항목 | 상태 | 증거 |
|---|---|---|
| 기존 UAT 역할 대상 | [x] | ADMIN·MANAGER·USER |
| staging 애플리케이션 사용자 | [x] | 3 ACTIVE, 역할 범위 3종 |
| Supabase Auth 계정 | [x] | 3계정 |
| 이메일 자동 확인 | [x] | 3/3 |
| 확인 메일 미발송 | [x] | `confirmation_sent_at` 0건 |
| 랜덤 비밀번호 보호 | [x] | ignored local env, 값 미기록 |
| password sign-in | [x] | 3/3 HTTP 200 |
| 검증 세션 정리 | [x] | 3/3 logout HTTP 204 |
| OIDC identity link | [x] | 3건, 고유 subject 3개 |
| issuer·역할 범위 | [x] | issuer 일치, ALL·ORGANIZATION·DEPARTMENT |
| 보호 listener | [x] | 1234·11434·18765·18766·18767 PID 보존 |

staging DB의 애플리케이션 사용자가 0건이어서 identity linking에 필요한 승인된 UAT 사용자 3행과 역할 범위를 최소 생성했다. Supabase Dashboard의 `Create new user`를 사용했고 기본 `Auto confirm user` 상태를 유지했으므로 확인 메일은 발송되지 않았다. 비밀번호와 세션 토큰은 어떤 문서·로그에도 기록하지 않았다.

## 다음 READY

상위 READY `P4-G1-STAGING-PROVIDER-ROUTES-AND-SECRET-REFERENCES`는 유지한다. `/oauth/consent` 로컬 구현까지 통과했으며, 다음 미충족 조건은 non-seed staging 배포·live consent/provider probe·DNS/TLS다.
