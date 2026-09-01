# ACC-P6-36 Physical External Signoff Reference Preflight

기준일: 2026-09-02

## 결과 / 상태

- [x] 역할 결과·서명 reference 절대경로 강제
- [x] 저장소 밖 physical JSON regular file 강제
- [x] symlink·reparse·저장소 경로·상대경로·디렉터리 차단
- [x] 빈 파일·1MiB 초과 파일 차단
- [x] 역할·서명 6개 reference의 physical 중복 차단
- [ ] 변경창 실제 역할 결과 3건·identity 서명 3건 입력

공식 Phase는 P6 6/8, `productionGo=false`다. 이 Packet은 파일 존재만으로 실제 UAT·서명 검증 READY가 열리던 공백을 닫으며 파일 내용·Secret을 읽거나 기록하지 않는다.

## 7범주 체크리스트

| 범주 | 결과 | 증거 |
|---|---|---|
| 목표·범위 | PASS | Production signoff preflight reference 경계만 보완 |
| 산출물 | PASS | physical external reference runtime, runner 연계, failure-first 회귀 |
| 검증 | PASS | failure-first 5건, focused 8 PASS·1 SKIP, 전체 570 PASS·2 SKIP |
| 보안 | PASS | 저장소·symlink·reparse·중복·과대 파일 fail-closed, path/content 미출력 |
| 추적성 | PASS | 큐·Harness·상태·로드맵·기계 증거 동기화 |
| Git·Rollback | PASS | exact 3파일 구현 commit `22fbbca…`, 원격 quality 검증 |
| 외부 Gate | WAIT | 실제 역할 결과 0/3·서명 0/3, 변경창 대기 |

## 검증 증거

- failure-first → physical external reference runtime 부재 5/5 EXPECTED FAIL
- focused → 기존 preflight 포함 8 PASS·Windows symlink 1 SKIP·0 FAIL
- `npm.cmd run production:signoff-preflight` → 실제 reference 0/6, `READY_WAIT_PRODUCTION_UAT_AND_SIGNOFF_REFERENCES`
- `npm.cmd run check` → 구문 340/340, 단위 570 PASS·2 SKIP·0 FAIL
- `npm.cmd run repository:hygiene` → 고정 자격증명 0
- GitHub-hosted quality run `33572287216`, tested SHA `22fbbcacd3a766e4b1efcdc94143ff0797696746` → unit·three-tier-integration 모두 SUCCESS
- `npm.cmd run harness:verify` → exit 0, `production-signoff-preflight` 포함 전체 Gate PASS

## 미완료 / 외부 Gate

변경창 실행에서 저장소 밖에 생성된 고유 역할 결과 3건과 업무·보안·운영 identity 서명 3건을 actual assembler/finalizer가 내용과 SHA까지 검증해야 한다. reference 준비 PASS만으로 실제 서명 또는 Production GO가 되지 않는다.
