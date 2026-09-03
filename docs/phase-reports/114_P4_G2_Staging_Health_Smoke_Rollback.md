# P4-G2 Staging Health·Smoke·Rollback 결과

기준일: 2026-08-31

결과: **PASS / live non-seed 복구 / P4 외부 Gate 대기**

## 실행 결과

| 단계 | 결과 |
|---|---|
| public tunnel 차단 | 전용 PID 31736만 정지, 기존 PID 24804 보존 |
| synthetic rollback | 3/3 healthy, smoke 5/5 |
| seed 인터넷 노출 | 없음 — rollback 동안 connector 정지 |
| live 재전진 | 3/3 healthy, smoke 5/5 |
| backend 로그 | 5xx·error·exception 0 |
| tunnel 복구 | PID 49400, Seoul edge 4연결 |
| OIDC 재검증 | start 302 → authorize 302 → callback 302 → ADMIN → logout 204 |
| 보호 서비스 | 1234/6632, 11434/8588, 18765/22716 보존 |

Windows/사무실 OS resolver는 터널 중단 직후 hostname을 negative-cache해 post-rollback operations preflight가 `ENOTFOUND`였다. 자동 재시도는 중단했다. 공용 DNS `1.1.1.1`은 A 레코드 2개를 반환했고 explicit-edge TLS/OIDC는 PASS해 공개 route와 애플리케이션 복구는 확인됐다.

## 남은 외부 Gate

1. 검증된 DB backup의 독립 off-site 저장소와 전송 승인
2. 현재 사용자의 P4 staging 업무·보안·운영 signoff

다음 READY는 `P4-G3-OFFSITE-BACKUP-AND-STAGING-SIGNOFF`다. 대상 저장소와 실제 데이터 전송 범위·책임자 승인이 없으므로 자동 업로드나 P4 완료 처리는 하지 않는다.
