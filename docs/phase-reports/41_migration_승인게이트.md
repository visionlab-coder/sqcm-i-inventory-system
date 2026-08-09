# Phase 41 migration 승인 게이트

- 상태: 저장소 범위 완료 / 운영 DB 실행 대기
- `db:migrate`와 `db:verify`를 앱 시작에서 분리했다.
- advisory lock, migration checksum, 미적용 migration 탐지를 유지한다.
- 운영 순서는 백업 증거→DB 승인→migrate→verify→backend 시작이다.
- 외부 조건: 승인된 운영 백업과 DB 변경 창구.
