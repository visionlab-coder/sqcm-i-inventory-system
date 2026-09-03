# Phase 81 — P2 main 릴리스 기준선 완료

기준일: 2026-08-25

## 완료 증거

- PR #22를 최신 head `dfc37e3bfa60ea69a54900678897ee6b3a0eb078`에서 quality CI green 후 squash merge했다.
- main SHA: `79a12924106b378d2337898c76a4dd431634b78d`
- main quality run `32796785801`: unit·three-tier-integration success
- release-images run `32796785689`: publish·backend/frontend attestation success
- Backend: `ghcr.io/visionlab-coder/sqcm-i-inventory-backend:sha-79a12924106b378d2337898c76a4dd431634b78d`
- Backend digest: `sha256:37ee6d90c0c8d4abbef0f3362a90fad1552f70e08c69b2fc8b7f4df476679f95`
- Frontend: `ghcr.io/visionlab-coder/sqcm-i-inventory-frontend:sha-79a12924106b378d2337898c76a4dd431634b78d`
- Frontend digest: `sha256:1b8fb5e04a48971c239db09776bf0b5882f53624a5b66ba3f77d5f1fee36b6dd`

두 digest는 서로 다르고 정확한 main SHA 태그 및 provenance attestation에 연결됐다.

## 비범위 보존

Production 배포, migration, Secret/OAuth, DNS/TLS, 실제 UAT와 AI PC runtime 변경은 수행하지 않았다. P2 완료는 불변 이미지 발행까지이며 운영 반영을 의미하지 않는다.

## 다음 READY

P3 `AI PC G1 읽기 전용 사전점검`: 기존 1234·11434·18765와 37봇을 보존하면서 독립 runtime·모델 checksum·listener·health 계약의 실제 증거 공백을 확인한다.
