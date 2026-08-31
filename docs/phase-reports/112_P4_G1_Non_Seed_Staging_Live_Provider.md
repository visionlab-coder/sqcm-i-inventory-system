# P4-G1 Non-seed Staging·Live Provider 결과

기준일: 2026-08-31

결과: **PASS / 현재 READY 완료 / P4 계속 진행**

## 체크리스트

| 항목 | 상태 | 실제 증거 |
|---|---|---|
| non-seed staging | [x] | `DB_RUN_SEEDS=false`, `DB_AUTO_MIGRATE=false` |
| Docker 3서비스 | [x] | `frontend`, `backend`, `database` 3/3 healthy |
| 외부 DB TLS | [x] | Supabase session pooler + 공식 CA + `verify-full` |
| Storage·Defender·OIDC readiness | [x] | `/api/readiness` 200, dependency 3종 `ok` |
| Cloudflare connector | [x] | tunnel `994b…`, PID 31736, Seoul edge 4연결 |
| DNS·TLS | [x] | hostname A 2개, 인증서 검증 오류 0 |
| provider HTTPS | [x] | 공개 health 200, 인증 필요 경로 401 |
| OAuth 종단 | [x] | start 302 → authorize 302 → callback 302 → ADMIN → logout 204 |
| 브라우저 | [x] | 새 탭에서 ADMIN dashboard 도달·logout 후 SSO 화면 |
| rollback 자산 | [x] | synthetic·candidate 각각 3컨테이너 삭제 없이 정지 보존 |
| 보호 서비스 | [x] | 1234/6632, 11434/8588, 18765/22716, 기존 cloudflared 24804 유지 |

## 해결한 실제 결함

1. event publisher는 production HTTPS 강제를 유지하면서 staging 내부 `host.docker.internal` 인증 통신만 허용했다.
2. consent UI가 SDK 자동 redirect와 자체 redirect를 중복 수행하던 경로를 `skipBrowserRedirect:true`로 단일화했다.
3. Cloudflare TLS가 내부 HTTP로 종단된 뒤 Nginx가 scheme을 덮어쓰던 문제를 staging `X-Forwarded-Proto https`로 고쳤다.
4. `COOKIE_SECURE=true` staging에서도 설정된 proxy hop을 신뢰하도록 Express 조건을 수정했다.

## 검증

- `npm.cmd run check`: syntax 118, unit 140/140 PASS
- `npm.cmd run ui:contract`: 20 PASS
- active operations manifest live probe: OIDC 200, health/readiness 200, Storage 404 reachability, scanner/event/alert/AI-ready 401, AI health 200
- OIDC 재현 스크립트: ADMIN session과 logout까지 PASS, Secret 출력 0
- 최종 backend 로그: 5xx·error·exception 검색 0

## 변경하지 않은 것

- commit·push·merge·release·Production은 실행하지 않았다.
- Secret 원문을 코드·문서·로그에 남기지 않았다.
- synthetic·candidate 컨테이너와 보호 프로세스를 삭제·종료하지 않았다.

## 다음 READY

`P4-G1-STAGING-BACKUP-MIGRATION-DEPLOYMENT` — 기존 논리 backup·restore와 Supabase migration 24/24 증거를 현재 live staging 배포에 연결하고 rollback 실행 계약을 닫는다.
