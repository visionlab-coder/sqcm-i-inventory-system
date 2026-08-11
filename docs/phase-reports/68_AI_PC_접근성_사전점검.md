# AI PC 접근성 사전점검 보고서

## 실행 결과

현재 작업 세션에서 읽기 전용으로 다음 endpoint를 확인했다.

| 대상 | 결과 |
|---|---|
| `127.0.0.1:1234/v1/models` | 연결 불가 |
| `localhost:1234/v1/models` | timeout |
| `host.docker.internal:1234/v1/models` | timeout |
| 로컬 LM Studio/소놀봇 프로세스 | 발견되지 않음 |
| 현재 Codex 앱 터미널 세션 | 연결된 세션 없음 |

## 판정

AI PC는 현재 작업 세션과 별도 환경이며, 이 세션에는 원격 PC를 조작할 연결·주소·터미널 권한이 없다. 기존 봇 보존 조건을 지키기 위해 네트워크 스캔, 원격 로그인, LM Studio 설정 변경을 수행하지 않았다.

## 자동화된 다음 연결 지점

`npm.cmd run ai:preflight` 명령을 추가했다. `AI_PROVIDER_DRIVER=external`과 `AI_PROVIDER_HEALTH_URL`이 주입되면 health endpoint에만 읽기 요청을 보내고, API key·응답 원문은 출력하지 않는다. 현재 기본 `rules` 모드에서는 안전하게 skip한다.

실제 브리지 endpoint가 연결된 후 이 명령을 실행해 staging 연결을 시작한다.
