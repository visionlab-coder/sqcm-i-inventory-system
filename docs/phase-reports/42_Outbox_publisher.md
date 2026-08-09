# Phase 42 Outbox publisher

- 상태: 저장소 범위 완료 / 실제 publisher 연결 대기
- migration 015에 시도 횟수·다음 재시도·lock·오류·dead-letter를 추가했다.
- production은 `eventPublisher.publish/healthCheck` 계약이 없으면 시작하지 않는다.
- backend는 SKIP LOCKED claim, 멱등키, 지수 backoff, 10회 dead-letter를 적용한다.
- 외부 조건: 실제 메일·알림·전자결재 공급자와 전달 증거.
