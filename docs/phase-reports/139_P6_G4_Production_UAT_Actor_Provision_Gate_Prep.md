# P6-G4 Production UAT Actor Provision Gate 준비

기준일: 2026-09-01

상태: **로컬 실행기 준비 완료 / 실제 계정 생성 NOT_RUN / Production NO-GO**

## 인증 생애주기 계약

- 사용자: Production 시험 ADMIN·MANAGER·USER
- 사전상태: 저장소 밖 승인 파일과 세 credential reference, 승인 변경창
- 정상전이: `UNREGISTERED 또는 exact P6-UAT marker → ACTIVE + MFA_ENABLED + ROLE_SCOPE_READY`
- 실패전이: 승인·credential 불일치, 기존 identity 충돌, 조직·부서 불일치 시 transaction rollback
- 세션: 비밀번호·MFA 재설정과 함께 기존 session을 0건으로 폐기
- 감사: 역할별 `PRODUCTION_UAT_ACTOR_PROVISIONED` 1건, approval ID만 기록
- 비범위: 실제 이메일 발송, 운영 실사용자 전환, 저장소 내 credential·개인정보 기록

## 7범주 완료 체크리스트

1. 목표·범위
   - [x] Production·SEOWON·ADMIN/MANAGER/USER 세 역할만 허용한다.
   - [x] 기존 비시험 identity와 다른 조직·역할은 덮어쓰지 않는다.
2. 산출물
   - [x] host runner, container transaction worker, Gate 모듈과 7개 회귀가 존재한다.
   - [x] cutover Gate 6은 actor provision 후 public role core smoke 순서다.
3. 검증
   - [x] focused 12/12, 저장소 구문 189개, 단위 245/245 PASS
   - [x] 현재 Production 이미지 worker module import와 `/tmp` 실행 경로 PASS
   - [x] 필요한 users·MFA·scope·audit column 28/28 확인
4. 보안·개인정보
   - [x] credential payload는 docker stdin으로만 전달하고 명령 인자·로그에 넣지 않는다.
   - [x] 비밀번호 bcrypt cost 12, TOTP AES-256-GCM 암호화 계약을 재사용한다.
5. 문서·Harness
   - [x] MASTER_ROADMAP·가속 큐·P6 증거·현재 상태·로드맵을 동기화했다.
6. Git·Rollback
   - [x] 계정·MFA·scope·session·audit는 한 DB transaction이다.
   - [x] worker 실패 시 DB rollback, 임시 container worker 제거 계약이 있다.
7. 미완료·다음 Gate
   - [ ] `PRODUCTION_UAT_ACTOR_APPROVAL_FILE`과 세 credential reference가 없다.
   - [ ] 실제 계정·MFA·DB 쓰기와 역할 core smoke는 `NOT_RUN`이다.
   - [ ] 실제 실행은 `2026-09-11 20:00~23:00 KST` 변경창에서만 허용한다.

다음 READY는 계속 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`다. 준비 증거는 실제 계정·MFA·역할 UAT PASS를 대신하지 않는다.
