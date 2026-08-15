# Phase 40 production bootstrap 분리

- 상태: 저장소 범위 완료
- production은 `DB_AUTO_MIGRATE=false`, `DB_RUN_SEEDS=false`를 강제한다.
- backend 시작은 적용된 migration checksum만 확인하며 테스트 계정·샘플 데이터를 생성하지 않는다.
- 개발·통합 환경은 기존 자동 bootstrap을 유지한다.
- 외부 조건: 실제 OIDC 운영 계정 프로비저닝 절차 승인.
