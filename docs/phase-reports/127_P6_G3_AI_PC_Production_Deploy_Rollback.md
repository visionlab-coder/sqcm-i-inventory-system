# P6-G3 AI PC Production 배포·롤백 증거

기준일: 2026-09-01

## 결과

`P6-G3-AI-PC-PRODUCTION-SECRETS-MIGRATION-DEPLOY-AND-ROLLBACK`은 **PASS**다. AI PC의 기존 37봇·staging·보호 포트를 유지하면서 별도 Compose 프로젝트 `seowon-inventory-production`을 loopback `127.0.0.1:3300`에 배포했고, 백업·복원과 실제 중지형 rollback 뒤 동일 불변 이미지로 재기동했다.

## 체크리스트

- [x] 실행계약 8/8과 정확한 파일 allowlist 고정
- [x] Production Secret을 저장소 밖 전용 경로에 저장하고 원문 미기록
- [x] 후보 SHA `e238ab8dab7f4729298ceb7ecc0f874a4a08829a` 원격 일치
- [x] GitHub-hosted quality run `33469721441` 성공
- [x] release-images run `33469730466` 성공
- [x] backend digest `sha256:955753aee0cd0d22d885db93a12850cc24aeaacffcbac159dba6846802b343fb`
- [x] frontend digest `sha256:63834026cf17b52377e414709dd7b93411fe2da6c79b15cb1f25c23a8fa43a33`
- [x] PostgreSQL 16 application migration 25/25, public table 54
- [x] Production seed 미실행, 사용자 0명
- [x] frontend/backend/database 정확히 3서비스 healthy
- [x] frontend만 `127.0.0.1:3300`, backend/database 호스트 공개 0
- [x] health·readiness·정적자산 200, 미인증 API 401
- [x] 최근 backend JSON 로그 29건 중 5xx 0·error event 0
- [x] 백업 238,533 bytes, SHA-256 검증
- [x] 임시 DB 복원: 필수 테이블 33/33·migration 25/25·행 수 일치
- [x] 실제 3서비스 중지·3300 포트 폐쇄·named volume 보존
- [x] rollback 뒤 재기동·스모크 재통과
- [x] staging 3서비스 healthy 유지
- [x] 보호 포트/PID `1234/6632`, `11434/8588`, `18765/22716`, `18766/65724` 보존
- [ ] public DNS/TLS·실사용자 로그인·최종 서명 — P6-G4 범위
- [ ] main 병합 — 실행하지 않음

## 시행 중 발견·해결

1. 후보 이미지에 `scripts/db-migrate.mjs`가 없어 one-off가 DB 변경 전에 중단됐다. 이미지에 포함된 동일 migration engine으로 25/25를 적용했다.
2. 비-root backend가 Docker secret을 읽지 못했다. 해당 secret 파일만 읽기 전용 `0444`로 조정했고 값은 출력·기록하지 않았다.
3. `createApp`가 `eventPublisher`를 두 번째 검증 단계에서 누락했다. 회귀 테스트와 코드 수정 후 새 SHA·CI·이미지를 만들고 재배포했다.

## 판정

P6-G3의 로컬 Production 배포·복구 Gate는 닫혔다. 그러나 공개 DNS/TLS, 실제 Production 사용자 인증·MFA, 최종 업무·보안·운영 서명이 없으므로 전체 Production은 아직 `NO-GO`다. 다음 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`이며 승인된 변경창 `2026-09-11 20:00~23:00 KST` 이전에는 공개 전환을 실행하지 않는다.
