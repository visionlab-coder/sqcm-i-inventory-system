# ACC-P7-20 Production GitHub Improvement Queue Collector

## 결과

- [x] P6 actual·P7 활성화·Production GO 전 GitHub read/write 0건
- [x] private용 저장소 밖 물리 token 또는 public용 명시적 anonymous read·triage attestation·output 경계
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

2026-09-03 public GitHub API probe는 HTTP 200을 반환했고 `operations` open Issue는 0건이었다. 실제 Issue 생성·수정은 0건이다. Collector는 명시적 anonymous read mode에서 Secret을 읽지 않도록 보완했으며 focused test 11/11이 PASS했다. 현재 실제 export는 triage attestation과 저장소 밖 output이 없어 `NOT_RUN`이다.

## 실제 실행 입력

- `P7_GITHUB_API_TOKEN_FILE`: private repository일 때 저장소 밖 읽기 전용 GitHub credential 파일
- `P7_GITHUB_PUBLIC_ANONYMOUS_READ`: public repository일 때 exact 확인 `ACK-P7-GITHUB-PUBLIC-ANONYMOUS-READ`
- `P7_IMPROVEMENT_QUEUE_TRIAGE_ATTESTATION_FILE`: 실제 triage 승인·책임자·일정·receipt
- `P7_IMPROVEMENT_QUEUE_INPUT_FILE`: 저장소 밖 신규 compiler 입력 파일
- `P7_IMPROVEMENT_QUEUE_COLLECTION_CONFIRMATION`: exact 실행 확인

P6 actual 완료와 P7 활성화 뒤에만 `npm.cmd run operations:improvement-queue-collector -- --collect`를 실행한다.
