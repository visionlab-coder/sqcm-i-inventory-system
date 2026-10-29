# 배정·반납·수리 요청 브라우저 실행 계약

ROLE: 세로 기능 검증 담당1명, execution_mode=single, 모델/추론 inherited/unknown, Laya=RULE.
GOAL: 현재 운영에서 고유 시험 자산의 배정·반납·수리 접수를 화면→API→실제 DB·감사로 대조한다.
SCOPE: 신규 표식 UAT-20261029-WORKFLOW-01, 현재 유효 ADMIN 브라우저의 요청 생성/제출·조회, 별도 기존 UAT ADMIN 승인, 합성 PNG 반납 증빙, 시험 정리·보존 대조.
OUT OF SCOPE: 실제 직원 자격증명/역할/조직/상태 수정, 기존 자산·배정·요청·수리 변경, 실제 사진/비용/발주, 배포·migration·서비스/터널 변경.
INPUTS / SOURCE OF TRUTH: 현재 사용자 요청, AGENTS/CLAUDE·현재 상태, enterprise/return/repair/self-service/approval 서비스와 브라우저·SQL. 기준 HEAD f28b9ad022edb22b173f24dda1b994b3a298adc2; 운영 e0d2b55. 기존 dirty5개 보존.
AUTHORITY: 고유 시험 자산과 그에 속한 배정·요청·사진·수리 기록만 생성·처리. 계정 행은 보존하고 현재 로그인은 교체하지 않는다. 승인자는 별도 보호 credential reference의 UAT ADMIN이며 자가승인 금지를 유지한다. 시험 사진은 합성 파일임을 이름·사유에 표시한다. 증거/도우미/조작 스킬/현재 상태 exact allowlist checkpoint 허용. 새 운영 권한을 만들지 않는다.
WORKFLOW: 보존 baseline → 기존 정책/상태/actor 확인 → 브라우저 등록 AVAILABLE → 배정 초안/제출 → 독립 UAT 승인 → 브라우저 내 비품 확인 → 브라우저 반납 사진/제출 → 독립 승인 → 브라우저 반납/이력 → 브라우저 수리 접수/진행 → 소유 시험 ticket 취소·자산 정상 정책 폐기·비활성 → 지문 비교·보고.
SUCCESS CRITERIA: 세 브라우저 생성 흐름과 상태/이력/사진/DB 일치, 활성 시험 배정0, 수리 비용 미발생, 직원/기존 업무 지문 불변, 보호 서비스 불변. 승인 API를 브라우저 승인 성공으로 표시하지 않는다.
FAILURE CRITERIA / STOP CONDITION: 기존 데이터 변화·자가승인 허용·Secret 노출·소유 표식 불일치 또는 같은 실패3회면 중단하고 보고. 대기/미실행은 FAIL로 위장하지 않는다.
CONSTRAINTS: 요청/자산/파일 ID를 실제 결과로 결속, 이미 성공한 쓰기 재전송 금지, SQL은 읽기 전용. 시험 정리는 정상 업무 API만 사용하고 보안·상태 규칙을 우회하지 않는다.
VERIFICATION / EVIDENCE: 브라우저 DOM·캡처, 각 단계 DB/감사·권한/자가승인 역조건, 단위 enterprise/approval/return/repair, 상태/계정 fingerprint, health·Git diff·Secret 검사·commit/push 결과.
OUTPUTS / FORMAT: 보고서177, ASSET_WORKFLOW_BROWSER_20261029_EVIDENCE.json, 체크리스트·새 조작 스킬, 현재 상태. 관찰 PASS/FAIL/NOT_RUN/HOLD와 결함을 분리. 원문 Secret·쿠키·직원 명부 제외.
