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
- `harness:verify`: 현재 READY에 등록된 비파괴 로컬 검증만 실행한다. 현재 P2에서는 Git diff, 구문·단위, UI 계약, Compose 서비스·health를 검사한다.

## 상태 전이 규칙

1. 실제 완료 증거 없이 Phase 상태를 변경하지 않는다.
2. 완료 시 `MASTER_ROADMAP.json`, `docs/roadmap.md`, `docs/current-state.md`를 같은 Loop에서 맞춘다.
3. 다음 Phase 하나만 `in-progress`로 열고 READY를 정확히 하나 둔다.
4. 승인 게이트에서는 외부 명령을 실행하지 않고 정확한 대상과 행위를 보고한다.
5. 사용자 변경은 reset·clean·broad staging하지 않는다.
