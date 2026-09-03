# P5-G1 Storage Driver 보완·UAT 재실행 보고

기준일: 2026-08-31

## 결과

`P5-DEFECT-001`은 staging에서 기술적으로 해결됐다. migration 025와 backend 재배포 후 정상 PNG의 Storage 저장·다운로드가 통과했고, USER Supabase SSO와 390×844 모바일 핵심 화면까지 확인해 기술 UAT는 **19 PASS·0 FAIL·0 PENDING**이다. P5 완료와 P5-G2 실제 서명은 아직 아니다.

## 체크리스트

- [x] 즉시 Supabase 논리 백업 488,209 bytes·archive list PASS·SHA-256 기록
- [x] 기존 migration 001~024 무수정
- [x] migration 025 `LOCAL|EXTERNAL|SUPABASE_S3`
- [x] Supabase history 25/25와 live 제약 readback
- [x] 구문 120, 단위 141/141, 프롬프트 계약 8/8
- [x] staging backend 신규 image healthy, health/readiness 200
- [x] 정상 PNG 201·다운로드 byte 일치
- [x] embedded EICAR PDF 422·DB 증가 0·alert receipt
- [x] MFA 정상·오류·복구코드 단회·원복
- [x] 승인·반납·구매·검수·수리·실사·CSV·401/403/400
- [x] outbox 16/16 published·감사 actor 48/48
- [x] 공개 모바일 390×844 overflow 0·console 0
- [x] USER Supabase SSO 로그인·역할 표시
- [x] 390×844 대시보드·자산·요청·배정/반납·보안 화면
- [x] overflow 0·console warning/error 0·로그아웃 후 로그인 화면 복귀
- [ ] P5-G2 업무·보안·운영 서명
- [x] commit·push·Production 변경 없음

## 안전 조치

잘못 구성된 첫 EICAR PDF가 clean으로 판정돼 저장된 `fileId=4`는 정확히 비활성화하고 Supabase Storage 객체를 삭제했으며 감사 이벤트를 기록했다. 이후 P3에서 통과한 실제 embedded-file fixture로 교체했고 재실행에서 HTTP 422, `file_records` 증가 0과 alert receipt를 확인했다.

## 배포·복구

- 신규 backend: `seowon-inventory-backend:p5-remediation-20260831`, digest `3ead5029…02a09`
- 이전 backend digest: `13968de0…d6bf`
- DB 복구점: `artifacts/backups/sqcm-i-supabase-staging-pre-p5-remediation-20260831T084206Z.dump`
- DB rollback 주의: 신규 `SUPABASE_S3` 행이 생성됐으므로 migration 025를 단독 역적용하지 않는다. 장애 시 이전 DB 백업과 호환 image를 함께 판단한다.

## 다음 Gate

다음 READY는 `P5-G2-STAGING-UAT-SIGNOFF`다. 기술 UAT 19/19와 Critical/High 0을 근거로 업무·보안·운영 책임자의 실제 staging 인수 서명을 기록한다. Production은 승인·서명 전까지 NO-GO다.
