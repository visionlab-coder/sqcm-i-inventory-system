# Phase 79 — 장기 Goal+Harness 설정

기준일: 2026-08-25

## 결과

- P0~P7 로드맵을 기계 판독하는 `MASTER_ROADMAP.json`을 추가했다.
- 한 번에 진행 Phase와 READY를 각각 하나만 허용하고, 완료 수·Docker 3서비스·보호 포트·외부 Git 승인 경계를 자동 검사한다.
- 현재 P2의 비파괴 로컬 재검증을 완료하고 다음 READY를 `P2-COMMIT-PUSH-APPROVAL`로 전환했다.
- commit·push·원격 CI·운영 배포·Secret·외부 메시지·실제 UAT는 자동 승인하지 않는다.

## 변경 범위

- `agent docs/prompts/79_장기_Goal_Harness_메타프롬프트.md`
- `agent docs/harness/MASTER_ROADMAP.json`
- `agent docs/harness/README.md`
- `scripts/goal-harness.mjs`
- `package.json`
- 현재 상태와 로드맵 연결

기존 P1 코드와 사용자 변경은 reset·clean·덮어쓰기하지 않았다.

## 검증 증거

| 검증 | 실제 결과 |
|---|---|
| Prompt contract strict | PASS, 필수 8/8, 경고 0 |
| `npm.cmd run harness:check` | PASS, 오류 0 |
| `git diff --check` | PASS |
| JavaScript 구문 | 96개 PASS |
| 단위 테스트 | 109/109 PASS |
| PostgreSQL·HTTP 통합 | 20/20 PASS |
| UI 계약 | 16 PASS |
| Compose 계약 | backend/database/frontend 3서비스 PASS |
| Docker 실행 상태 | `seowon-inventory-local` 3서비스 모두 running·healthy |
| 배포 smoke | health, readiness, 익명 401, 공식 로고 포함 5개 PASS |
| 유지보수 | frontend/backend 200, PostgreSQL 16.15, 필수 테이블 32개 PASS |
| SQCM-i OS | 모델 37, Awake 8 |
| 보호 listener | 1234/PID 6632, 11434/PID 8588, 18765/PID 22716 보존 |
| 저장소 위생 | 고정 자격증명 0, Mock 메타데이터 0, PNG 제작 메타데이터 0 |
| 운영 의존성 audit | 취약점 0 |

## 코드→운영 8단계 판정

| 단계 | 상태 | 근거·남은 게이트 |
|---|---|---|
| 1 코드·릴리스 기준선 | 진행 중 | 로컬 기준 SHA와 원격 main이 `112ff5a03112b63a5ce23ac00bc64e418e3625b4`로 일치. 후보 stage·commit·push·Draft PR 승인 필요 |
| 2 로컬 품질 | 증거 있는 완료 | 구문·단위·통합·UI·Docker·smoke·유지보수 PASS |
| 3 불변 Artifact | 승인된 보류 | commit 후 정확한 40자리 SHA와 이미지 digest 필요 |
| 4 GitHub-hosted CI | 승인된 보류 | 브랜치 push와 PR/CI 실행 승인 필요 |
| 5 배포 승인 | 승인된 보류 | production 활성화는 기본 false, 실제 승인 주체·환경 필요 |
| 6 전용 runner | 승인된 보류 | 전용 runner와 격리 증거 없음 |
| 7 운영 반영·복귀 | 승인된 보류 | 운영 Secret·OIDC·외부 저장소·불변 이미지 입력 없음 |
| 8 운영 인계 | 승인된 보류 | UAT·백업/PITR·경보·온콜·복구 증거 없음 |

`npm.cmd run deploy:check`는 로컬 환경에 운영 Secret, OIDC, 외부 저장소, 정확한 SHA 이미지가 없으므로 의도대로 fail-closed 됐다. 값을 추정하거나 검사를 우회하지 않았으며 production NO-GO를 유지한다.

## 남은 게이트

P2의 다음 게이트에는 검증된 변경 묶음의 정확한 allowlist stage·commit, `origin/codex/fix-sidebar-accessibility` push, `main` 대상 Draft PR 생성과 원격 CI PASS가 필요하다. `quality.yml`은 작업 브랜치 push만으로 실행되지 않고 PR에서 실행되므로 Draft PR이 승인 대상에 포함된다. merge·release·main push·불변 이미지 발행은 이번 승인 범위가 아니며 별도 게이트로 남긴다.
