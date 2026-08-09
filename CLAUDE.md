# Claude 프로젝트 지침

이 프로젝트에서 작업할 때 다음 문서를 먼저 읽는다.

1. `AGENTS.md`
2. `agent docs/Agent.md`
3. `agent docs/global instructions/00_1-7일차_통합전역지침.md`
4. 현재 작업 영역에 해당하는 `agent docs/global instructions/01`부터 `06`까지의 지침

작업 우선순위는 현재 사용자의 명시적 요구 → Client Docs → Developer Docs → 통합 전역지침 → 에이전트 판단이다.

반드시 지킨다.

- 웹개발 12단계를 순서와 산출물 기준으로 따른다.
- Browser → Endpoint → Controller → Service → Repository/Mapper → Database 흐름을 유지한다.
- 인증·인가·조직 범위·감사 로그를 서버에서 검사한다.
- DB 변경·대여·반납·상태 변경은 트랜잭션과 제약조건으로 보호한다.
- 컨셉아트 → HTML Mock → 프리뷰 → 사용성 검토 → API 연결 순서로 화면을 만든다.
- 기능 구현과 단위 테스트를 함께 수행하고 통합·브라우저 검증을 한다.
- 실제 검증 결과 없이 완료를 주장하지 않는다.
