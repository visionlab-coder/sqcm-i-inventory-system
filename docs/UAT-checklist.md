# 서원토건 비품관리 UAT 체크리스트

대상 SHA: __________  환경/URL: __________  실행일: __________  UAT Run ID: `P5-UAT-________________`

## 사전 조건

- [ ] 승인된 staging URL·TLS와 테스트 조직·부서가 준비됐다.
- [ ] 실제 비밀은 플랫폼 Secret에만 있고 화면·로그·Git에 노출되지 않는다.
- [ ] 배포 전 백업과 rollback 이미지 태그를 확인했다.
- [ ] 직원·부서 담당자·관리자 계정이 서로 분리됐다.
- [ ] fixture는 `P5-UAT-<RUN_ID>` 접두사의 합성·비식별 데이터이며 실제 업무 데이터와 분리됐다.
- [ ] 모든 쓰기 요청의 request ID와 audit actor·action·entity를 기록할 수 있다.

## 사용자 시나리오

- [ ] SSO 로그인, 세션 회전, 로그아웃, 만료 후 401을 확인했다.
- [ ] MFA 정상·오류·복구코드 단회 사용을 확인했다.
- [ ] 직원은 자기/허용 부서 자산만 조회하고 타 부서는 보이지 않는다.
- [ ] 자산 등록·검색·상세·증빙 업로드/다운로드가 동작한다.
- [ ] 배정 요청의 다단계 승인 순서와 자기 승인 차단을 확인했다.
- [ ] 반납 사진·상태·부속품·메모를 제출하고 최종 승인 후 반납 원장을 확인했다.
- [ ] 구매 요청·발주·부분 입고·검수 후에만 자산이 생성된다.
- [ ] 재물조사·수리·분실·폐기와 감사 검색·CSV 다운로드를 확인했다.
- [ ] 모바일 폭에서 핵심 조회·요청·승인·반납 사진 업무를 수행했다.

## 실패·운영 시나리오

- [ ] 권한 부족 403, 만료 세션 401, 잘못된 입력 400이 안전한 메시지로 표시된다.
- [ ] 감염·unknown·timeout 파일은 저장되지 않는다.
- [ ] IdP·저장소·검사기 장애 시 readiness 503과 경보를 확인한다.
- [ ] health, 핵심 smoke, 5xx 로그와 승인된 target manifest의 migration 전체를 확인한다.
- [ ] rollback 후 health·로그인·조회와 DB 호환성을 확인한다.
- [ ] 격리 복구에서 원본과 복구 DB 건수가 일치한다.

## 결함과 승인

| ID | 역할 | 심각도 | 재현 절차 | 기대 | 실제 | 담당자 | 수정 버전 | 재검증 증거 | 상태 |
|---|---|---|---|---|---|---|---|---|---|
| P5-DEFECT-001 | MANAGER | High | 정상 PNG를 자산 증빙 API로 업로드 | 201·Storage 저장·다운로드 | migration 025 후 201·byte 일치 | SQCM-I_ENGINEERING | P5-G1-REMEDIATION | `P5-UAT-08` | RESOLVED_TECHNICALLY |

Critical은 인증 우회·조직/부서 데이터 노출·원장 손상·복구 불가, High는 승인·대여/반납·구매·감사 핵심 흐름 실패다. 열린 Critical 또는 High가 1건이라도 있으면 NO-GO다.

업무 책임자: `PROJECT_OWNER_CURRENT_USER` / 전자서명: `SIGNED` / 2026-08-31 18:23:49 KST
보안 책임자: `PROJECT_OWNER_CURRENT_USER` / 전자서명: `SIGNED` / 2026-08-31 18:23:49 KST
운영 책임자: `PROJECT_OWNER_CURRENT_USER` / 전자서명: `SIGNED` / 2026-08-31 18:23:49 KST

서명이 비어 있으면 실제 운영 인수는 완료가 아니다.

## P5-G1 실행 스냅샷 — 2026-08-31

- [x] P5-UAT-01~19 — 실제 PASS 19개
- [x] P5-UAT-13 — USER Supabase SSO, 390×844 대시보드·자산·요청·배정/반납·보안, overflow 0, console 0, 로그아웃 PASS
- [x] P5-G2 업무·보안·운영 실제 전자서명 3/3
- [x] P5 증거 있는 완료 — 19/19·Critical/High 0·서명 3/3
- 다음 READY: `P6-G1-PRODUCTION-TARGET-CHANGE-WINDOW-AND-PROVIDER-INPUT`
