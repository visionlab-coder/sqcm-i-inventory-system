# Phase 83 — P3 독립 Bridge 계약 구현

기준일: 2026-08-25

## 판정

`PASS_LOCAL_CONTRACT_ONLY / P3_HOLD`

외부 runtime을 시작하거나 listener를 열지 않고 SQCM-i가 호출할 독립 bridge의 애플리케이션 계약을 구현했다. 이는 G3의 로컬 코드·단위 테스트 증거이며, 실제 runtime·모델·TLS·운영 증거를 대신하지 않는다.

## 구현 범위

- `GET /health`: 인증 없는 최소 liveness
- `GET /ready`: bearer 인증, runtime 미준비·오류 시 503 fail-closed
- `POST /recommend`: bearer 인증, 조직 allowlist, 최대 50개 자산, 허용 행동만 반환
- `POST /ocr`: bearer 인증, 조직 allowlist, 자산·파일·텍스트 입력 검증
- 모델 version과 `sha256:<64 hex>` checksum 필수
- runtime adapter 주입 구조로 기존 LM Studio·Ollama·wslrelay와 직접 결합하지 않음
- 오류 응답에 bearer token·runtime 원문 오류를 포함하지 않음

## 검증 증거

| 검사 | 결과 |
|---|---|
| bridge·runtime adapter 전용 단위 테스트 | 7/7 PASS |
| JavaScript 구문 | 101개 PASS |
| 전체 단위 테스트 | 116/116 PASS |
| 저장소 위생 | fixed credential·mock metadata·PNG metadata 0 |

## 변경하지 않은 항목

이 보고서 작성 시점의 로컬 계약 구현에서는 프로세스·Windows Service·예약 작업·포트·방화벽·폴더·ACL·Secret·모델을 생성하거나 시작하지 않았다. 이후 승인된 runtime 구축 결과는 Phase 84 보고서가 소유한다.

## 남은 Gate와 다음 READY

G1 독립 runtime·모델 checksum·라이선스, G2 listener·TLS·source allowlist, G3 실제 health/ready, G4 서비스·로그·메트릭·rollback, G5 실제 UAT는 HOLD다.

독립 runtime 구축 이후 다음 READY는 `P3-SQCMI-ADAPTER-CONNECTION-APPROVAL`로 변경됐다. 현재 판정은 Phase 84와 Master Harness를 우선한다.
