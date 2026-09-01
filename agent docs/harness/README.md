# 장기 Goal+Harness 운영

이 Harness는 `docs/roadmap.md`의 P0~P7을 한 번에 한 Phase씩 실행하기 위한 기계 판독 계약이다. 자동 수행 범위는 로컬 읽기·비파괴 검증·현재 READY의 허용 파일 수정까지다. commit·push·원격 CI·배포·Secret·외부 메시지·실제 UAT는 승인을 대신하지 않는다.

## 명령

```powershell
npm.cmd run harness:status
npm.cmd run harness:check
npm.cmd run harness:verify
```

- `harness:status`: 현재 Phase와 READY를 JSON으로 출력한다.
- `harness:check`: 상태 파일의 단일 진행 Phase, 완료 수, READY·권한 불변식과 실제 Git branch provenance 일치를 검사한다. GitHub Actions에서는 `GITHUB_HEAD_REF`/`GITHUB_REF_NAME`, 로컬에서는 symbolic ref를 사용하며 해석 불가·불일치는 fail-closed한다.
- `harness:verify`: 현재 READY에 등록된 비파괴 로컬 검증만 실행한다. 현재 P6에서는 Git diff, 품질·계약, staging/Production 3서비스 health와 cutover Gate 실행기를 검사한다.

## P6/P7 가속 실행 큐

`P6_P7_ACCELERATION_QUEUE.json`은 외부 변경창을 기다리는 동안에도 실제 실행 자동화 공백을 한 건씩 닫는다. `READY` Packet은 정확히 하나이며 `WAIT_CHANGE_WINDOW`, `EXTERNAL_INPUT`, `NOT_RUN`은 실패로 세지 않는다.

- 실패 1회: 재현과 최소 수정
- 동일 실패 2회: 같은 수용조건의 대체 구현·도구·경로
- 동일 실패 3회: 자동 재시도 중단과 복구조건 기록
- P7 준비 산출물은 미리 만들 수 있지만 P6 완료 전 P7 상태를 활성화하지 않는다.
- P6 공개 전환은 `production:ingress-publication -- --execute`로 exact tunnel·runtime config·DNS를 게시한 뒤 `production:public-probe`를 실행한다. rollback token file reference와 publication·route-disable 확인 문자열이 없으면 게시하지 않는다.
- 역할 시험은 `production:uat-actor-provision -- --execute`로 승인된 세 actor를 transaction provision한 뒤 `production:role-core-smoke -- --public`을 실행한다. 승인 파일과 세 credential reference는 저장소 밖 보호 파일만 허용한다.
- P7 완료 증거는 `P7_OPERATIONS_HANDOVER_ACTUAL_EVIDENCE_CONTRACT.json`의 schema 2를 따른다. P6 cutover·운영 8영역·운영 서명 총 10개 실제 JSON은 각각 `{path, sha256}`로 참조하며 `operations:handover-finalizer`가 파일 존재·SHA-256·Production provenance·도메인 측정값을 검증한다. 계약 템플릿과 문자열-only 참조는 완료 증거가 아니다.
- 10개 실제 문서가 준비되면 `operations:handover-assembler -- --assemble`이 P6 완료·P7 진행 중 상태, 입력 10건, 저장소 밖 출력 경로와 정확한 확인 문자열을 검사한 뒤 finalizer를 선검증하고 schema 2 manifest를 원자적으로 1회 작성한다. 기존 출력은 덮어쓰지 않는다.
- SLO 실제 문서는 `P7_SLO_MEASUREMENT_INPUT_CONTRACT.json` 계약을 따르는 template=false 외부 30일 Production HTTPS 측정 JSON을 `operations:slo-evidence -- --compile`이 SHA-256 검증하고 가용성·p95를 직접 계산해 임계치 통과 시에만 저장소 밖에 원자적으로 1회 작성한다. 계약 template·loopback 측정은 actual로 승격하지 않고, P6 완료·P7 활성화·정확한 확인 문자열 전에는 dry-run 대기하며 기존 파일을 덮어쓰지 않는다.
- 경보 실제 문서는 `P7_ALERT_RECEIPT_INPUT_CONTRACT.json` 계약을 따르는 template=false Production 공급자 export에서 경보 5종의 고유 receipt·발생/수신 시각과 공급자·채널·수신자·책임자 참조를 `operations:alerting-evidence -- --compile`이 검증해 저장소 밖에 원자적으로 1회 작성한다. staging·loopback·순서 변경·미수신·중복 receipt는 actual로 승격하지 않는다.
- 백업·복원 실제 문서는 `P7_BACKUP_RESTORE_DRILL_INPUT_CONTRACT.json`의 동일 Production drill export를 `operations:backup-restore-evidence -- --compile`이 검증해 backup·restore 2개 문서로 만든다. backup은 24시간 RPO·30일 retention·off-site 보관·checksum을, restore는 동일 backup ID·격리 DB·4시간 RTO·row-count digest·migration 일치를 강제하며 두 출력은 저장소 밖에 원자적으로 함께 쓰고 기존 파일을 덮어쓰지 않는다.
- 인증서 실제 문서는 `P7_CERTIFICATE_OBSERVATION_INPUT_CONTRACT.json`의 최근 Production TLS 관측을 `operations:certificate-evidence -- --compile`이 검증한다. exact hostname, chain·hostname 검증, TLSv1.2/1.3, serial·SHA-256 fingerprint, 유효기간, health/readiness 200, 30일 갱신 lead와 운영 책임자 provenance가 모두 통과해야 저장소 밖에 원자적으로 1회 쓰며 기존 파일을 덮어쓰지 않는다.
- 온콜 실제 문서는 `P7_ONCALL_HANDOVER_INPUT_CONTRACT.json`의 30일 이상 Asia/Seoul 연속 당번표와 최근 7일 escalation drill을 `operations:oncall-evidence -- --compile`이 검증한다. 서로 다른 primary·escalation 책임자의 수락, 5분·15분 이내 고유 acknowledgement receipt와 역할 일치를 모두 강제하며, 담당자를 지정하거나 메시지를 보내지 않고 저장소 밖에 원자적으로 1회만 쓴다.
- 정기점검 실제 문서는 `P7_MAINTENANCE_EXECUTION_INPUT_CONTRACT.json`의 최근 24시간 Production 일일 점검 실행을 `operations:maintenance-evidence -- --compile`이 검증한다. `docs/maintenance.md`, 불변 release SHA, 운영자 identity, frontend/API/DB health·5xx·로그인 실패 급증·백업 6종의 순서·PASS·고유 receipt, 24시간 안의 다음 일정을 모두 강제하며 실제 점검을 실행하지 않고 저장소 밖에 원자적으로 1회만 쓴다.
- 개선 큐 실제 문서는 `P7_IMPROVEMENT_QUEUE_INPUT_CONTRACT.json`의 전용 GitHub operations Issue export를 `operations:improvement-queue-evidence -- --compile`이 검증한다. 최근 24시간 export·7일 triage와 다음 triage, triage 책임자·receipt·미추적 finding 0건, 각 open item의 고유 Issue·source·severity·상태·담당자·수용조건·30일 후속기한을 강제하며 실제 Issue를 생성·수정하지 않고 저장소 밖에 원자적으로 1회만 쓴다.
- 운영 책임자 실제 서명 문서는 `P7_OPERATIONS_SIGNOFF_INPUT_CONTRACT.json`의 승인 export를 `operations:signoff-evidence -- --compile`이 검증한다. exact Production URL·불변 release SHA·P6 cutover 증거 SHA, 순서가 고정된 운영 8영역의 PASS·고유 SHA, 최근 24시간 OPERATIONS_OWNER identity 승인·receipt·운영 업무 6종 수락·차단 예외 0건을 모두 강제한다. 서명을 생성하거나 책임자를 지정하지 않고 저장소 밖에 원자적으로 1회만 쓴다.
- `operations:evidence-pipeline-rehearsal`은 8개 영역 compiler·운영 서명 compiler·manifest assembler·10문서 finalizer를 합성 전용 임시 디렉터리에서 종단 연결한다. 정상 흐름 10/10과 조립 뒤 파일 변조의 SHA 차단을 함께 확인하고 임시 파일을 즉시 제거한다. 이 결과는 `syntheticOnly=true`, `actualEvidenceCreated=false`, `productionGo=false`이며 실제 P7 완료 증거가 아니다.
- `production:cutover-failure-matrix`는 12개 cutover Gate를 각각 한 번씩 실패시켜 실패 Gate까지만 실행되고 이후 Gate가 모두 중단되는지 검사한다. 각 시나리오는 exact public route-disable가 확인돼야 격리 PASS하며, route-disable 미확인·결과 개수/순서/값 변조와 합성 all-pass의 Production GO 승격을 차단한다. 실제 cutover·route 변경은 수행하지 않는다.

## 상태 전이 규칙

1. 실제 완료 증거 없이 Phase 상태를 변경하지 않는다.
2. 완료 시 `MASTER_ROADMAP.json`, `docs/roadmap.md`, `docs/current-state.md`를 같은 Loop에서 맞춘다.
3. 다음 Phase 하나만 `in-progress`로 열고 READY를 정확히 하나 둔다.
4. 승인 게이트에서는 외부 명령을 실행하지 않고 정확한 대상과 행위를 보고한다.
5. 사용자 변경은 reset·clean·broad staging하지 않는다.
6. Phase 또는 가속 Packet 상태가 바뀔 때만 정본·체크리스트·증거를 동기화한다.
