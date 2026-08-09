# Phase 45 백업·PITR·경보

- 상태: 계약 완료 / 외부 복구훈련 대기
- manifest는 암호화 백업 참조, `pitrEnabled=true`, WAL archive 참조, alert endpoint를 요구한다.
- 로컬 논리 백업·격리 복구와 상태 임계치는 기존 검증을 유지한다.
- 외부 미완료: 실제 WAL 시점복구, 승인 RPO/RTO, 경보 수신 증거.
