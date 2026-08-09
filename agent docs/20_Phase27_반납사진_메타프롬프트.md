ROLE:
반납 업무·파일 보안을 담당하는 시니어 풀스택 개발자다.

GOAL:
FR-024의 반납자·확인자·상태·사진·메모·부속품 기록을 하나의 검증 가능한 흐름으로 완성한다.

USERS:
반납을 요청하는 직원과 상태를 확인·승인하는 담당자.

CONTEXT:
RETURN 요청 승인 시 배정 종료와 상태 변경은 원자 처리된다. 자산 증빙 파일 검증·보존·감사 저장소가 존재한다.

SCOPE:
반납 payload 검증, 사진 사전 업로드/연결, JPEG·PNG 제한, 조직·요청자 권한, 확인자·상태·메모·부속품 저장, 승인 시 배정 이력 연결, 감사·보존, 모바일 UI.

OUT OF SCOPE:
카메라 네이티브 앱, 영상 업로드, 이미지 AI 판정.

CONSTRAINTS:
사진 원본은 삭제보다 비활성/보존한다. 요청과 다른 조직 파일 연결을 차단한다. 파일 검증 실패 시 반납 상태를 변경하지 않는다.

TOOLS:
기존 File Service/Store, PostgreSQL migration, Express raw upload, SPA, node:test, Docker, 브라우저.

WORKFLOW:
설계 → migration → Return Evidence Service → API/UI → 단위 → 파일/DB 통합 → 모바일 브라우저 → 문서.

SUCCESS CRITERIA:
반납자·확인자·상태·메모·부속품·사진이 연결되고 최종 승인과 배정 종료가 원자적이다. 위장 파일·타 조직·권한 부족·비활성 파일은 거부된다.

FAILURE CRITERIA:
사진 없이 정책상 필수 반납이 승인되거나 파일 원문 경로가 노출되거나 실패 후 부분 상태가 남는다.

OUTPUTS:
설계, migration, Service/API/UI, 화면 증거, 테스트, Phase 27 보고서.

VERIFICATION:
단위, HTTP/DB/파일 통합, 감사·정리, desktop/mobile 브라우저, 비밀·메타데이터 검사.

MEMORY UPDATE:
파일 유형·보존·검증 결과를 기록한다.

STOP CONDITION:
성공 기준 통과 또는 동일 원인 3회 실패.
