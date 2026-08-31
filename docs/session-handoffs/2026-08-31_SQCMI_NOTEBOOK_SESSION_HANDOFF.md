# SQCM-i 비품관리 노트북 작업 인계

기준일: 2026-08-31

## 프로젝트 기준선

- 저장소: `https://github.com/visionlab-coder/sqcm-i-inventory-system.git`
- 작업 브랜치: `codex/fix-sidebar-accessibility`
- 로컬 정본 경로: `D:\seowon_projects\sqcm-i-inventory-system`
- 현재 진행률: `6 / 8 Phase 완료`
- 현재 Phase: `P6 Production 전환`
- 다음 READY: `P6-G1-PRODUCTION-TARGET-CHANGE-WINDOW-AND-PROVIDER-INPUT`
- Production: `NO-GO`

최종 원격 SHA는 GitHub의 `origin/codex/fix-sidebar-accessibility`를 정본으로 확인한다. 이 문서는 커밋 자체의 SHA를 자기 참조하지 않는다.

## 완료된 범위

- P2 릴리스 기준선·CI 완료
- P3 AI PC bridge/runtime/OCR/관측·Pilot UAT 19/19 완료
- P4 전용 staging, Supabase migration 001~025, Storage/OIDC/provider, backup·rollback·off-site 검증 완료
- P5 staging UAT 19/19, Critical/High 0, 업무·보안·운영 전자서명 3/3 완료
- P6-G0 preflight 완료: Production target·provider·manifest·cutover·runner 입력 부족으로 fail-closed

## 이번 Git 인계 검증

| 검증 | 실제 결과 |
|---|---|
| JavaScript 구문 | 120 PASS |
| 단위시험 | 141/141 PASS |
| 통합시험 | 20 PASS, 실제 Defender 1 SKIP |
| 로컬 migration | application 24/24 PASS |
| UI 계약 | 20 PASS |
| Compose 계약 | frontend/backend/database 3서비스 PASS |
| 운영 계약 | manifest·12 Gate template 계약 PASS, Production 권한 효과 없음 |
| Harness | 6/8, P6, 오류 0 |
| 저장소 위생 | fixed credential 0, mock metadata 0 |

통합시험 첫 실행은 환경변수 미주입으로 Not Run이었고, 두 번째 실행은 로컬 DB가 migration 024 이전이라 실패했다. 로컬 DB를 forward-only 24/24로 맞춘 뒤 migration 목록을 manifest 정본에서 읽도록 테스트를 보완했으며 최종 재실행은 20 PASS·1 설계 SKIP이다.

## 노트북에서 먼저 실행

새 clone이면 다음 순서로 시작한다.

```powershell
git clone https://github.com/visionlab-coder/sqcm-i-inventory-system.git
Set-Location sqcm-i-inventory-system
git switch --track origin/codex/fix-sidebar-accessibility
npm.cmd ci
npm.cmd run harness:status
npm.cmd run harness:check
npm.cmd run check
```

이미 clone이 있으면 작업물을 먼저 보존한 뒤 `git fetch origin`과 `git pull --ff-only`를 사용한다. reset·clean은 금지한다.

## Git으로 전달되지 않는 항목

- `.env`, `.env.staging.local`과 모든 실제 Secret
- `artifacts/backups/` DB dump
- `artifacts/uploads/` 시험 업로드 파일
- Supabase CLI `.temp` 상태
- 현재 PC의 Docker 볼륨·브라우저 세션·보호 PID

노트북에서 staging 연결이 필요하면 Secret 값을 대화나 Git에 붙이지 말고 승인된 로컬 Secret 파일을 별도로 구성한다.

## 다음 작업과 승인 경계

다음 READY는 비품관리 전용 Production hostname, staging과 분리된 Production Supabase/공급자, release candidate, 변경 시간·책임자와 전용 runner 입력을 확정하는 것이다. 권장 hostname은 `inventory.safe-link.co.kr`이지만 실제 DNS·프로젝트·runner·Production 변경은 별도 승인 전 실행하지 않는다.

금지 범위: 무승인 main 병합·release·Production 배포/migration·DNS/TLS·Secret/OAuth·보호 서비스 종료.

## 먼저 읽을 파일

1. `AGENTS.md`
2. `docs/current-state.md`
3. `docs/roadmap.md`
4. `agent docs/harness/MASTER_ROADMAP.json`
5. `docs/phase-reports/120_P6_G0_Production_Cutover_Preflight.md`
