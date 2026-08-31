# P3 G5 Defender Local Alert Integration

기준일: 2026-08-25

상태: **PASS — P3 G0~G5 증거 있는 완료**

## Phase 체크리스트

- [x] P3 목표·범위·제외 범위 충족
- [x] Microsoft Defender 실제 provider와 정확한 버전 확인
- [x] clean·EICAR infected·unknown·timeout fail-closed
- [x] 현재 사용자 Windows session 경보와 JSONL receipt
- [x] 실제 애플리케이션 EICAR PDF HTTP 422·DB 저장 0건
- [x] 단위·통합·maintenance·smoke·Harness 검증
- [x] Docker 3서비스와 보호 listener 보존·rollback 이미지 유지

진행률: `19 / 19 PASS`, 승인 `3 / 3`, Critical/High `0`

## 공급자

| 구분 | 선택 | 결과 |
|---|---|---|
| Malware scanner | Microsoft Defender Antivirus `4.18.26070.9` | signature `1.457.324.0`, 실제 clean/infected PASS |
| Scanner endpoint | 인증 P3 bridge `/security/scan` | Docker에서 host.docker.internal로 연결 |
| Alert provider | Windows Session Message | 현재 사용자 세션에 infected·unknown·timeout receipt |
| Credential | 기존 P3 bridge bearer key-file reference | read-only volume, 원문 미기록 |
| 데이터 흐름 | AI PC 내부 | 외부 클라우드 전송 없음 |

## 검증

- Prompt contract: 8/8 PASS
- JavaScript syntax: 107 PASS
- Unit: 122/122 PASS
- PostgreSQL integration: 20/20 PASS
- 실제 Defender UAT: 1/1 PASS
- Maintenance: frontend/backend 200, required tables 32 PASS
- Deploy smoke: 5/5 PASS
- 최종 backend image: `sha256:ff3eeeffff6b2466f771bc8f0f1c196d53a40b38ad8d3c3cc1740de15740a1f8`
- rollback image: `sha256:b9f0b76d2841b1e21f9da726719fcba08e9e2afff33711405e34cbd64651e284`

AI 통합 전체 검증 첫 실행에서는 frontend 30초 timeout 뒤 남은 runtime 요청 때문에 후속 추천도 504가 됐다. 자동 반복 대신 backend 직접 경로를 확인해 정상 2/2를 확인했고 backlog 해소 후 frontend 2/2와 전체 통합 20/20이 PASS했다. timeout 설정을 완화하지 않았다.

## 경계와 다음 READY

이 구성은 로컬 Pilot 전용이다. production 공급자·HTTPS·Secret·운영 경보를 승인하지 않는다.

다음 READY: `P4-G0-STAGING-TARGET-AND-PROVIDER-INPUT`

staging 대상 입력 전에는 배포·migration·DNS/TLS를 실행하지 않는다.
