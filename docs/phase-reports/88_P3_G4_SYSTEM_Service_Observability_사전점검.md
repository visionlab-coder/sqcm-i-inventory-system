# Phase 88 — P3 G4 SYSTEM Service 및 Observability 사전점검

기준일: 2026-08-25

## 판정

`BLOCKED_ADMIN_AND_SERVICE_PATH_HARDENING`

사용자는 G4 SYSTEM service·observability 변경을 승인했다. 그러나 현재 Codex 프로세스는 `DESKTOP-8FN510S\user`의 비관리자 token이며, SYSTEM scheduled task/service 등록에 필요한 권한이 없다. 권한 우회나 UAC 자동 동의는 수행하지 않았다.

또한 현재 runtime root·config·logs와 repository bridge entrypoint는 상속된 `Authenticated Users: Modify`를 가진다. Secret 파일 두 개는 상속 차단 후 SYSTEM·현재 사용자만 FullControl이지만, SYSTEM이 읽을 코드·일반 config가 사용자 수정 가능하므로 이 경로를 그대로 SYSTEM으로 실행하면 권한 상승 경로가 된다.

## 읽기 전용 증거

| 항목 | 실제 상태 |
|---|---|
| 현재 identity | `DESKTOP-8FN510S\user` |
| 관리자 token | `false` |
| runtime task | 현재 사용자, LogonTrigger, Running |
| bridge task | 현재 사용자, LogonTrigger, Running |
| task restart | 3회, 1분 간격, StartWhenAvailable |
| runtime/bridge Secret ACL | 상속 차단, SYSTEM·현재 사용자만 FullControl |
| runtime root/config/logs | Authenticated Users Modify 상속 |
| bridge entrypoint | Authenticated Users Modify 상속 |

## 변경하지 않은 범위와 보존 상태

- scheduled task 등록·수정·중지·재시작 없음
- ACL·서비스·방화벽·Secret 변경 없음
- backend external 연결과 runtime/bridge listener 유지
- 보호 포트 1234·11434·18765 변경 없음
- Git stage·commit·push·migration·Production 변경 없음

## 필요한 다음 결정

권장안은 관리자 세션에서 사용자 쓰기 불가 전용 service artifact 경로를 만든 뒤 SYSTEM task를 등록하는 것이다. 대안은 SYSTEM 대신 현재 사용자 S4U·startup trigger를 사용해 로그온 전 실행하되 최소권한을 유지하는 방식이다. 두 방식은 보안·권한 모델이 다르므로 자동 선택하지 않는다.

다음 READY는 `P3-G4-HARDENED-SYSTEM-OR-S4U-DECISION`이다.
