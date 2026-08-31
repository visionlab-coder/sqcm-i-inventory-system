# P4-G0 Staging 대상·공급자 재개 점검

기준일: 2026-08-29 08:39 KST
결과: **HOLD_STAGING_INPUT_REQUIRED**
로드맵: **4 / 8 Phase 완료**, 현재 P4, READY 유지

## 1. 부재 중 변화 점검

| 항목 | 결과 | 증거 |
|---|---|---|
| 로컬 Git HEAD | 변화 없음 | `dfc37e3bfa60ea69a54900678897ee6b3a0eb078`, 마지막 commit 2026-08-25 |
| 원격 작업 브랜치 | 변화 없음 | 원격 SHA가 로컬 HEAD와 동일 |
| 원격 main | 변화 없음 | `79a12924106b378d2337898c76a4dd431634b78d` |
| 기존 dirty 작업 | 보존 | 기존 P3 추적·미추적 파일을 reset/clean/stage하지 않음 |
| Docker 3서비스 | PASS | backend/database/frontend 모두 healthy, 재시작 0회 |
| 앱 로컬 상태 | PASS | frontend `127.0.0.1:3000` HTTP 200, backend `127.0.0.1:58080/health` HTTP 200 |
| P3 관찰 작업 | 계속 실행됨 | 2026-08-29 08:35:23, 종료 결과 0 |
| 보호 listener | PASS | 1234/6632, 11434/8588, 18765/22716, 18766/65400, 18767/28532 보존 |

판정: 자리를 비운 동안 **새 개발 commit이나 P4 진행은 없었다**. 다만 P3 관찰 예약 작업과 기존 로컬 서비스는 정상 운용됐다.

## 2. P4-G0 입력 체크리스트

| 필수 입력 | 상태 | 현재 증거 / 부족한 것 |
|---|---|---|
| staging 전용 hostname | ☐ HOLD | `sqcm.safe-link.co.kr` DNS/TLS와 SQCM-i OS는 살아 있으나 비품관리 staging 전용·격리 대상이라는 증거 없음 |
| staging 서버·계정·접속 방식 | ☐ HOLD | 승인된 호스트·계정·권한 범위 없음 |
| PostgreSQL·PITR | ☐ HOLD | 로컬 DB만 확인. 외부 staging DB, WAL archive, 보존, RPO/RTO 책임자·credential reference 없음 |
| 객체 저장소 | ☐ HOLD | `objects.example.com` 템플릿뿐임 |
| OIDC | ☐ HOLD | `idp.example.com` 템플릿뿐이며 tenant/client/claim/Secret reference 없음 |
| malware scanner | ☐ HOLD | P3 Defender는 로컬 증거이며 staging endpoint·credential reference 없음 |
| event publisher | ☐ HOLD | `events.example.com` 템플릿뿐임 |
| alert provider/channel | ☐ HOLD | P3 Windows Session Message는 로컬 증거이며 staging 수신자·채널·endpoint·credential reference 없음 |
| AI provider | ☐ HOLD | 로컬 loopback bridge는 보존됐으나 staging reachability·credential reference 없음 |
| Secret reference 9종 | ☐ HOLD | `secret://...` 예시 경로만 있고 승인된 Secret Manager·실제 참조 없음 |

## 3. 통합·배포 계약 사전검토

`bamsoft-integration-preflight` 기준으로 실제 공급자 연결은 **HOLD**다. 공급자·정확한 endpoint·계정·권한·credential reference·감사 담당자가 확정되지 않았기 때문이다. 이는 설치나 연결을 거부한 것이 아니라, 권한과 데이터 경계를 판정할 입력이 없는 상태다.

| 검사 | 결과 | 의미 |
|---|---|---|
| `npm.cmd run harness:check` | PASS, 오류 0 | READY 단일성과 로드맵 계약 정상 |
| operations template preflight | PASS | 구조 템플릿만 유효. 외부 증거 아님 |
| `npm.cmd run operations:contracts` | PASS | manifest·cutover 예제 계약 정상 |
| `npm.cmd run compose:contract` | PASS, 3서비스 | Docker 불변식 유지 |
| `.env.production.example` deploy precheck | 예상대로 FAIL, exit 1 | 예시 Secret과 불변 SHA 부족을 fail-closed로 차단 |
| `https://sqcm.safe-link.co.kr/` | HTTP 200 | SQCM-i 공개 페이지 존재 |
| `/health` | HTTP 200, SQCM-i OS 로그인 HTML | 비품관리 health 증거로 인정하지 않음 |
| `/api/readiness` | HTTP 401 | 인증된 비품관리 staging readiness 증거 없음 |

## 4. 권한과 변경 범위

- 사용자의 “P4-G0 이후 승인 없이 계속” 요구는 로컬 읽기·계약 검증·문서·Harness 준비 작업의 연속 실행 권한으로 기록했다.
- 존재하지 않는 서버·공급자·계정·Secret을 임의 생성하거나, 다른 SQCM-i OS 도메인을 비품관리 staging으로 간주하지 않았다.
- 배포, migration, DNS/TLS, OAuth, 계정·Secret, 외부 메시지, Git 외부 쓰기는 수행하지 않았다.
- 기존 dirty 파일과 보호 서비스는 변경하지 않았다.

## 5. Phase 시각화

| Phase | 상태 | 완료 Gate |
|---|---|---|
| P0 로컬 기준선 | ✅ 증거 있는 완료 | Docker·로컬 검증 |
| P1 UI 접근성 | ✅ 증거 있는 완료 | UI·브라우저 계약 |
| P2 릴리스 기준선·CI | ✅ 증거 있는 완료 | 원격 CI·SHA·digest |
| P3 AI PC 연동 | ✅ 증거 있는 완료 | G0~G5, UAT 19/19 |
| **P4 Staging** | **⏸ 진행 중 / G0 HOLD** | 실제 대상·공급자 입력 필요 |
| P5 역할별 UAT | ⏳ 승인된 보류 | P4 완료 후 실제 역할별 UAT |
| P6 Production | ⏳ 승인된 보류 | P3~P5·cutover 승인 |
| P7 운영·유지보수 | ⬜ 미착수 | 백업·경보·복구·온콜 인수 |

진행률: `████░░░░ 4 / 8`

## 6. 다음 READY

`P4-G0-STAGING-TARGET-AND-PROVIDER-INPUT`을 유지한다. 다음 Gate로 넘어가려면 최소한 다음 실제 입력 묶음이 하나의 승인된 운영 패킷으로 필요하다.

1. 비품관리 staging 전용 hostname과 호스트/계정/접속 방식
2. PostgreSQL/PITR 대상, WAL·backup reference, RPO/RTO와 책임자
3. OIDC·객체 저장소·scanner·event publisher·alert·AI의 실제 HTTPS endpoint와 계정 범위
4. 실제 값이 아닌 Secret Manager reference 9종

입력이 생기면 다음 Loop에서 비템플릿 manifest 구조 검사 → provider live probe → staging backup/migration 사전검사 순으로 자동 재개한다.
