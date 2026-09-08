---
name: sqcm-i-r5-production-deployment
description: SQCM-i 비품관리 R5 후보를 AI PC Production에 배포하거나 배포 준비·복귀를 검증할 때 사용한다. 일반 개발 배포나 다른 환경에는 사용하지 않는다.
---

# SQCM-i R5 Production 배포

먼저 저장소의 `agent docs/harness/ASTRA_REMAINING_WORK.json`, `R5_ACTIVE_DEPLOYMENT_APPROVAL.json`, `R5_WORKER_FREEZE_CANDIDATE.json`을 읽고 서로 같은 후보·대상·URL인지 확인한다.

## 조작

1. `npm.cmd run production:r5-driver-preflight`를 실행한다. `PASS_R5_PRODUCTION_DRIVER_PREFLIGHT` 외에는 mutation을 시작하지 않는다.
2. 기본 배포 명령은 dry-run이어야 한다. `--execute`, 승인 문서와 일치하는 확인값, 변경창 시작 이상 cutoff 미만이 동시에 있어야 실제 driver를 연다.
3. driver는 ingress/worker freeze → 쓰기 0 → create-only 보호 백업과 별도 DB 복원 검증 → seed 없는 migration → 후보 이미지/3서비스/비공개 포트 확인 → loopback 인증 smoke → release → 실제 HTTPS/인증/DB 재검증 순서를 지킨다.
4. release 전 실패는 원본 DB를 덮지 않고 별도 복원 DB에 결박한 이전 runtime을 준비한 뒤 ingress를 차단한다. release 후 실패는 새 쓰기가 있을 수 있으므로 이전 DB 자동복원을 금지하고 ingress·worker를 차단해 후보 DB를 보존한다.
5. 출력은 상태·SHA·boolean receipt만 기록한다. Secret, credential, container 환경, 원문 stderr/stdout과 운영 데이터 경로는 출력하지 않는다.

## 검증과 중단

- `node --test test/unit/r5-*.test.js`
- `node scripts/r5-isolated-recovery-rehearsal.mjs --candidate-sha=<40자리 SHA> --fail-at=migrate`
- `node scripts/r5-isolated-recovery-rehearsal.mjs --candidate-sha=<40자리 SHA> --fail-at=switchImages`

격리 리허설은 별도 임시 Compose project·내부 network·tmpfs만 사용해야 한다. 같은 원인의 실제 실행 실패가 3회면 재시도하지 않는다. Production 변경창 밖에는 preflight·격리 리허설만 수행한다.
