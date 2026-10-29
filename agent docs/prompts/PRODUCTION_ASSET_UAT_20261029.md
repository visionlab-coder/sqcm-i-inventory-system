# 시험 자산 운영 통합검증 계약

ROLE: 대표 업무 검증자. execution_mode=single, 모델 설정 inherited/unknown, Laya=RULE.
GOAL: 실제 Inventory HTTPS 로그인→시험 자산1개 등록→수정→조회가 API와 DB에 일치하는지 확인한다.
SCOPE: 기존 UAT ADMIN 전용 자격증명 reference, 고유 UAT-20261029 표식 자산1개, 감사·상태이력과 기존 데이터 보존 비교.
OUT OF SCOPE: 직원 계정/비밀번호/역할/기존 자산 변경, 계정 생성·잠금 해제, 배포·서비스 재시작, SQL 데이터 수정, 외부 메시지 임의 발송.
WORKFLOW: 보호 reference·시험계정·취소 정책 읽기 전용 preflight → 직원 및 기존 업무 테이블 fingerprint → 별도 HTTP 세션 로그인 → DRAFT 등록 → 지원되는 수정 기능 확인 → 시험 자산 CANCELLED 처리 → 상세/검색/DB 대조 → 로그아웃 → 보존 비교. 직원 브라우저의 기존 세션은 건드리지 않는다.
INPUTS / SOURCE OF TRUTH: 현재 사용자 승인, 프로젝트 지침, 실제 src/enterprise-routes.js·enterprise-service.js·frontend/app.js와 운영 DB. 없는 기능·입력은 추정하지 않는다.
AUTHORITY: 사용자 승인 범위의 시험 자산 생성·수정만 허용. 기존 시험계정의 Secret은 메모리에서만 사용하고 출력·기록하지 않는다. 직원 계정으로 대체하지 않는다.
SUCCESS CRITERIA: 실제 로그인·등록·지원되는 수정·재조회 및 DB/감사 일치, 직원/기존 업무 fingerprint 불변. 기본정보 수정과 상태 수정은 별도 판정한다.
FAILURE CRITERIA / STOP CONDITION: 계정·권한·자격증명·취소 정책 부재, 기존 데이터 변화, 동일 원인3회 실패. 자산명 등 수정 기능 부재는 미구현으로 보고하며 상태 변경 PASS로 대체하지 않는다.
VERIFICATION / EVIDENCE: HTTPS 응답 코드·시험 자산 ID/표식·이력 수·fingerprint·로그아웃 및 이전 세션 거부. 브라우저 미실행은 NOT_RUN으로 구분.
OUTPUTS / FORMAT: 비식별 JSON과 체크리스트 결과 보고. 코드/운영 변경은 별도 요청 없이 하지 않는다. 시험 자산은 파괴 삭제하지 않고 승인된 취소 상태와 감사이력을 보존한다.
