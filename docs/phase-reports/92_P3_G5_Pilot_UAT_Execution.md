# Phase 92 — P3 G5 Pilot UAT 실행

기준일: 2026-08-25

## 판정

`PARTIAL_PASS_16_OF_19 / HOLD_EXTERNAL_UAT_ROLLBACK_AND_SIGNOFF`

사용자 승인과 `PROJECT_OWNER_CURRENT_USER` 담당 체계로 로컬 파일럿 UAT를 실행했다. 자동·API·브라우저·DB·운영 증거가 있는 16개는 PASS, 현재 로컬 구성에서 실제 증거를 만들지 못한 3개는 NOT_RUN이다. 실패 항목과 열린 Critical/High 결함은 없다.

## 진행 시각화

```text
P3 G5  [████████████████░░░] 16/19 PASS (84.2%)
PASS 16 | FAIL 0 | NOT_RUN 3 | Critical 0 | High 0
책임자 지정 3/3 | 실제 승인 서명 0/3
```

## 핵심 통과 증거

- JavaScript syntax 101, unit 117/117
- PostgreSQL·HTTP 통합 UAT 20/20
- external OCR 집중 검증 2/2, UI 계약 16, deploy smoke 5/5
- USER·MANAGER·ADMIN 브라우저 로그인·역할 메뉴·로그아웃
- 390×844 모바일 메뉴·로그아웃, 가로 넘침 없음, console 오류 0
- 60요청 오류율 0%, p95 14.2ms, 익명 401·cross-site 403
- 현재 DB 백업 246,193 bytes와 SHA-256 생성
- 격리 복구에서 32개 필수 테이블·22개 migration·표본 건수 전부 일치
- database pause 후 health 503 감지 6,028ms, unpause 후 200 복구 6ms
- frontend·backend·database 3서비스와 보호 listener/PID 보존

## 발견·수정 결함

`P3-G5-DEFECT-01` (Medium, RESOLVED): external OCR에 자산·파일·텍스트 없이 요청하면 provider 400이 backend 500으로 노출됐다. route에서 필수 입력을 먼저 검증해 400으로 fail-closed하고, integration test를 rules/external 실행 응답 계약에 맞게 보완했다. invalid 400, external OCR 200, 집중 2/2와 전체 통합 20/20으로 재검증했다.

## NOT_RUN 3개

| ID | 사유 | 필요한 증거 |
|---|---|---|
| UAT-15 | 로컬 mock scanner는 실제 infected·unknown·timeout 응답을 제공하지 않음 | 외부 malware scanner test response와 저장 0건 |
| UAT-16 | readiness 503→200은 PASS했으나 외부 경보 채널이 없음 | 실제 경보 수신 시각·수신자 |
| UAT-18 | rollback 이미지·절차는 보존됐으나 현재 후보 rollback을 실행하지 않음 | rollback→health·로그인·조회·DB 호환→재전진 |

## 승인과 다음 READY

업무·보안·운영 책임자는 모두 `PROJECT_OWNER_CURRENT_USER`로 지정됐지만 실제 승인 서명은 0/3이다. 지정만으로 서명을 대체하지 않았다.

다음 READY는 `P3-G5-EXTERNAL-UAT-ROLLBACK-AND-SIGNOFF`다. 위 3개 실행 증거와 업무·보안·운영 승인 3건이 모두 확보되기 전에는 P3 G5를 완료로 전환하지 않는다.
