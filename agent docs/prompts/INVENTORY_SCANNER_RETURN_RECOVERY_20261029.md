# 검사기·기존 반납 초안 복구 실행 계약

ROLE: Inventory 운영 복구·세로 검증 단일 담당. execution_mode=single, 모델/추론 inherited/unknown, Laya RULE.
GOAL: 검사 실행파일을 복구하고 기존 RETURN2의 사진·제출·독립 승인·반납 종료를 완료해 시험 활성 배정0을 만든다.
SCOPE: Inventory bridge18766의 scanner 경로와 해당 task 단독 재시작, frontend 최소 초안 재업로드/제출 UI·같은 자산/요청, 시험 정리·증거·복구 checkpoint.
OUT OF SCOPE: SQCM-i/SAFE-LINK/cloudflared/runtime18767/LM Studio/Ollama 재시작, 직원 계정·실데이터 변경, 새 반납 초안, backend/DB 변경·migration·광범위 UI 개편.
INPUTS / SOURCE OF TRUTH: 현재 사용자 승인 및 frontend 최소 수정·재배포 추가 승인, 프로젝트 지침, 보고서177와 기존 trial baseline/receipt, 실제 task·listener 소유권·Microsoft 서명 파일·코드·UI/DB. 시작 HEAD de43864752cfbf14ad90edc9c34fa86717493409, dirty5개 보존.
AUTHORITY: 원본 ACL을 보존한 config 백업, 서명/해시 확인된 CurrentVersion scanner 경로로 한 줄 수정, exact task/명령/시작시각/port owner 확인 후 해당 bridge만 재시작. frontend는 로컬/CI green 동일 SHA로만 반영하며 backend/DB 컨테이너 유지. 기존 요청2만 재업로드·제출·별도 UAT 승인, 정상 업무 API로 시험 정리. Secret은 보호 reference에서 메모리로만 사용.
WORKFLOW: 보호 baseline → scanner 서명·합성 scan0 → config 백업·경로 한 줄 수정 → exact bridge task restart → backend 실제 scanner clean/health → 기존 초안 재시도 기능/집중 시험·CI → frontend만 배포 → 브라우저 request2 사진 재업로드·제출 → 독립 UAT 승인 → DB/브라우저 반납 이력 → 시험 자산 비활성·지문 대조·보고.
SUCCESS CRITERIA: scan clean, 기존 RETURN2 APPROVED·반납1·사진1·활성 배정0, 새 RETURN0, 기존25개 테이블·직원13/권한13 지문 불변, 보호 PID/서비스/HTTP 정상. frontend/backend 분리 SHA를 명시.
FAILURE CRITERIA / STOP CONDITION: 대상/owner 불일치, 비표적 변화, 보안 우회·Secret 노출, 같은 원인3회 실패면 중단·복구조건 보고. 누락 입력을 추정하지 않는다.
CONSTRAINTS: 서명 Valid·존재 확인된 파일만 실행, blind kill·광범위 프로세스 종료·SQL 쓰기 금지. 오류 때 기존 초안 ID 유지·중복 제출 차단·보이는 오류. 승인 단계와 역할 분리를 보존.
VERIFICATION / EVIDENCE: unit·브라우저 upload/retry·실제 malware receipt·CI SHA·이미지/컨테이너 ID·DB 기록·보존 지문·health/tunnel·exact Git diff/Secret 검사·push SHA.
OUTPUTS / FORMAT: 보고서178, SCANNER_RETURN_RECOVERY_20261029_EVIDENCE.json, 현재 상태·스킬/등록부 및 source/tests. PASS/FAIL/NOT_RUN/HOLD를 분리하고 P7 전체 완료로 승격하지 않는다.
