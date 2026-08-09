# 프로젝트 에이전트 지침

이 저장소의 작업은 루트 `AGENTS.md`와 [`agent docs/Agent.md`](./agent%20docs/Agent.md)를 함께 따른다.

작업 시작 전에 다음 지침을 읽는다.

- [`global instructions/00_1-7일차_통합전역지침.md`](./agent%20docs/global%20instructions/00_1-7일차_통합전역지침.md)
- 작업 영역에 해당하는 `01`부터 `06`까지의 영역별 전역지침
- [`agent docs/Agent.md`](./agent%20docs/Agent.md)

현재 사용자의 명시적 요구, 원본 Client Docs, Developer Docs, 통합 전역지침, 에이전트의 임의 판단 순서로 우선순위를 적용한다.

1. 작업 순서는 프로젝트 → 문서 → 요구사항 → 기능 → 인프라 → DB → 화면(페이지별 컨셉·HTML mock) → 기능개발/체크리스트 → 단위 테스트 → 통합 테스트 → 배포 → 유지보수다.
2. 각 Phase의 완료 정의·성공/실패 기준·검증 결과를 `docs/phase-reports`에 기록한다.
3. 변경은 Issue → branch → 구현 → 단위 테스트 → 문서 → commit → PR 흐름을 기준으로 한다.
4. 배포는 build → deploy → health → 핵심 스모크 → 로그 → 성공 또는 rollback 순서다.
5. 프롬프트는 목표·범위·제약·단계별 성공/실패 기준을 포함한 4,000자 이내 메타프롬프트로 `agent docs`에 보존한다.
6. 컨셉아트와 HTML mock에는 생성 도구·프롬프트·모델 등 제작 메타데이터를 노출하지 않는다.
7. 파란 배경에는 공식 반전 로고, 밝은 배경에는 공식 컬러 로고를 사용한다.
8. Controller → Service → Repository/Mapper → Database 데이터 흐름과 DB 결과의 반대 방향 왕복을 유지한다.
9. 기능 구현과 같은 작업 단위에서 단위 테스트를 수행하고, 통합 테스트·브라우저 Smoke Test까지 검증한다.
10. 비밀번호·토큰·세션 원문·DB 비밀을 코드·로그·커밋에 남기지 않는다.
11. 권한은 화면뿐 아니라 API·Service·데이터 조회 범위에서 검사한다.
12. 실제 실행·테스트·로그 증거가 없으면 완료로 보고하지 않는다.
