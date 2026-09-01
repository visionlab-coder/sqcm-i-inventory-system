# ACC-P7-20 Production GitHub Improvement Queue Collector

## 결과

- [x] P6 actual·P7 활성화·Production GO 전 GitHub read/write 0건
- [x] 저장소 밖 물리 token·triage attestation·output 경계
- [x] exact repository와 `operations` label 고정
- [x] 일반 Issue 본문을 신뢰하지 않는 단일 bounded JSON metadata 파서
- [x] source·severity·status label과 metadata 일치
- [x] 담당자·수용조건·triage·다음 행동·BLOCKED 의존성 검증
- [x] compiler 선검증과 원자적 1회 export
- [x] Issue 생성·수정 0건
- [x] focused test 6/6 PASS
- [x] JavaScript 구문 270/270 PASS
- [x] 전체 단위 408 PASS·Windows-only 1 SKIP·0 FAIL (409 total)
- [x] `npm.cmd run harness:verify` PASS

## 현재 판정

`npm.cmd run operations:improvement-queue-collector`는 `READY_WAIT_P6_ACTUAL_CUTOVER`를 반환했다. 현재 실제 GitHub API read, token 사용, export write와 Issue 변경은 모두 `NOT_RUN`이다.

## 실제 실행 입력

- `P7_GITHUB_API_TOKEN_FILE`: 저장소 밖 읽기 전용 GitHub credential 파일
- `P7_IMPROVEMENT_QUEUE_TRIAGE_ATTESTATION_FILE`: 실제 triage 승인·책임자·일정·receipt
- `P7_IMPROVEMENT_QUEUE_INPUT_FILE`: 저장소 밖 신규 compiler 입력 파일
- `P7_IMPROVEMENT_QUEUE_COLLECTION_CONFIRMATION`: exact 실행 확인

P6 actual 완료와 P7 활성화 뒤에만 `npm.cmd run operations:improvement-queue-collector -- --collect`를 실행한다.
