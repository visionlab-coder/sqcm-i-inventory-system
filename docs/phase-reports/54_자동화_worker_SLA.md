# Phase 54 — 규칙 기반 자동화·알림·SLA·worker

## 구현

- `018_automation_rules_notifications.sql` 추가
  - 규칙, 실행 이력, notification, worker lease 테이블
- 기본 규칙: 유휴 자산, 반납 SLA, 보증 만료, 승인 SLA
- `src/automation/worker.js`에 lease·dedupe·실행/실패 기록 구현
- `scripts/automation-worker.mjs`와 `compose.production.yaml`의 독립 worker 서비스 추가
- `/api/enterprise/notifications`에 조직·수신자 범위 적용

## 검증

- worker lease 단위 테스트 통과
- Docker backend와 별도 worker 이미지 구성이 정적 검증됨
- `npm.cmd run check`, 통합 17/17 통과

## 남은 위험

이메일·Slack·Teams 등 외부 알림 공급자와 운영 주기/모니터링은 아직 계약 전이다. worker는 DB notification까지를 제품 범위로 하고, 외부 전송은 승인된 adapter가 생긴 뒤 활성화한다.

## 판정

**완료(외부 알림 adapter 전).**
