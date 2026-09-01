# P6-G2 Release Candidate Git·CI·불변 이미지 증거

기준일: 2026-09-01

## 결과

`P6-G2-RELEASE-CANDIDATE-GIT-CI-AND-IMMUTABLE-IMAGES`는 **PASS**다. 정확한 47파일 allowlist를 Secret 징후 0건으로 commit·push했고, Draft PR #23과 GitHub-hosted quality CI, backend/frontend 멀티아키텍처 불변 이미지를 동일 후보 SHA로 검증했다.

## 체크리스트

- [x] 후보 브랜치 `codex/p6-ai-pc-postgres-production` 분리
- [x] 후보 SHA `a73dda495e8365612c24cd9c9f4070a9aa8548e6` 원격 일치
- [x] 정확한 allowlist 47파일, 금지 파일 0, Secret 서명 0
- [x] Draft PR [#23](https://github.com/visionlab-coder/sqcm-i-inventory-system/pull/23) 생성, merge 0
- [x] GitHub-hosted `quality #45` run `33466804085` 성공
- [x] 동일 SHA `release-images #9` run `33466895762` 성공
- [x] backend OCI index `sha256:8de4fb1545deb2fd2bdbfbf1c7752709921f8d11914cba79d01ccecb915efd3d`
- [x] frontend OCI index `sha256:dc41a39f871289a3382e1c48bb263b656158ca92b7a94da37f111519a8e0f49d`
- [x] 두 이미지 `linux/amd64`, `linux/arm64` manifest와 provenance attestation 확인
- [x] staging `frontend/backend/database` 3서비스 healthy
- [x] 보호 포트/PID `1234/6632`, `11434/8588`, `18765/22716` 보존
- [ ] main merge·release — 비범위, 실행하지 않음
- [ ] Production Secret·migration·배포·DNS/TLS — 비범위, 실행하지 않음

## 판정

P6-G2의 Git·CI·이미지 게이트는 닫혔다. Production은 여전히 `NO-GO`이며 다음 READY는 `P6-G3-AI-PC-PRODUCTION-SECRETS-MIGRATION-DEPLOY-AND-ROLLBACK`이다. 다음 Gate에서는 digest 고정 이미지와 Production 전용 Secret을 사용하되 실제 migration·배포·rollback 증거가 모두 생기기 전에는 P6를 완료하지 않는다.
