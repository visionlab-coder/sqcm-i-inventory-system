# ACC-P6-20 변경창 입력 준비 봉투

## 결과/상태

변경창 실행에 필요한 외부 입력을 단일 fail-closed 점검으로 묶었다. 현재 위험한 실행 확인값은 0개로 안전하지만 물리 참조는 0/5이고 actual evidence 출력 경로도 미설정이므로 `READY_WAIT_CHANGE_WINDOW_INPUT_REFERENCES`다.

## 체크리스트

- [x] Cloudflared 실행 파일 존재
- [x] Cloudflare origin certificate 존재
- [x] Production runtime 물리 디렉터리 확인
- [ ] Cloudflare DNS rollback token 파일 참조
- [ ] Production UAT actor 승인 파일 참조
- [ ] ADMIN credential 파일 참조
- [ ] MANAGER credential 파일 참조
- [ ] USER credential 파일 참조
- [ ] 저장소 밖 actual cutover evidence 출력 경로
- [x] 변경 실행 확인값 사전 무장 0개
- [x] Secret 원문 출력·기록 0건
- [x] 외부 변경 0건

## 검증 계약

- 승인 파일과 세 credential의 역할·이메일 일치를 검사한다.
- credential 이메일 중복, 저장소 내부 출력, 기존 출력 덮어쓰기, 비물리 parent를 차단한다.
- 변경 실행 확인값이 변경창 전에 설정돼 있으면 차단한다.
- `WAIT`는 실패로 세지 않으며 실제 참조가 준비될 때 같은 명령으로 재판정한다.

## 다음 READY

공식 READY는 `P6-G4-PRODUCTION-DNS-TLS-CUTOVER-AND-SIGNOFF`를 유지한다. 승인된 변경창 전에 위 6개 참조를 저장소 밖에 준비해야 한다.
