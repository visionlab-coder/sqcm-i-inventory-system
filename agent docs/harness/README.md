# 장기 Goal+Harness 운영

이 Harness는 `docs/roadmap.md`의 P0~P7을 한 번에 한 Phase씩 실행하기 위한 기계 판독 계약이다. 자동 수행 범위는 로컬 읽기·비파괴 검증·현재 READY의 허용 파일 수정까지다. commit·push·원격 CI·배포·Secret·외부 메시지·실제 UAT는 승인을 대신하지 않는다.

## 명령

```powershell
npm.cmd run harness:status
npm.cmd run harness:check
npm.cmd run harness:verify
```

- `harness:status`: 현재 Phase와 READY를 JSON으로 출력한다.
- `harness:check`: 상태 파일의 단일 진행 Phase, 완료 수, READY와 권한 불변식을 검사한다.
- `harness:verify`: 현재 READY에 등록된 비파괴 로컬 검증만 실행한다. 현재 P6에서는 Git diff, 품질·계약, staging/Production 3서비스 health와 cutover Gate 실행기를 검사한다.

## P6/P7 가속 실행 큐

`P6_P7_ACCELERATION_QUEUE.json`은 외부 변경창을 기다리는 동안에도 실제 실행 자동화 공백을 한 건씩 닫는다. `READY` Packet은 정확히 하나이며 `WAIT_CHANGE_WINDOW`, `EXTERNAL_INPUT`, `NOT_RUN`은 실패로 세지 않는다.

- 실패 1회: 재현과 최소 수정
- 동일 실패 2회: 같은 수용조건의 대체 구현·도구·경로
- 동일 실패 3회: 자동 재시도 중단과 복구조건 기록
- P7 준비 산출물은 미리 만들 수 있지만 P6 완료 전 P7 상태를 활성화하지 않는다.
- P6 공개 전환은 `production:ingress-publication -- --execute`로 exact tunnel·runtime config·DNS를 게시한 뒤 `production:public-probe`를 실행한다. rollback token file reference와 publication·route-disable 확인 문자열이 없으면 게시하지 않는다.
- 역할 시험은 `production:uat-actor-provision -- --execute`로 승인된 세 actor를 transaction provision한 뒤 `production:role-core-smoke -- --public`을 실행한다. 승인 파일과 세 credential reference는 저장소 밖 보호 파일만 허용한다.

## 상태 전이 규칙

1. 실제 완료 증거 없이 Phase 상태를 변경하지 않는다.
2. 완료 시 `MASTER_ROADMAP.json`, `docs/roadmap.md`, `docs/current-state.md`를 같은 Loop에서 맞춘다.
3. 다음 Phase 하나만 `in-progress`로 열고 READY를 정확히 하나 둔다.
4. 승인 게이트에서는 외부 명령을 실행하지 않고 정확한 대상과 행위를 보고한다.
5. 사용자 변경은 reset·clean·broad staging하지 않는다.
6. Phase 또는 가속 Packet 상태가 바뀔 때만 정본·체크리스트·증거를 동기화한다.
