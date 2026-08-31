# P4-G3 Off-site Backup·Staging Signoff 실행계약

기준일: 2026-08-31

ROLE: staging 백업 독립 보관과 Phase 서명 증거 관리자다.

GOAL: 복구 검증된 Supabase staging 논리 백업을 승인된 독립 저장소에 비공개 전송하고 P4 업무·보안·운영 서명을 기록한다.

SCOPE: 회사 Google Drive 계정 확인, 소유자 전용 폴더 생성, dump·manifest 업로드, 재다운로드 크기·SHA-256 비교, P4 서명과 Harness 동기화다.

OUT OF SCOPE: 공유 링크 생성, 외부 사용자 권한 부여, 원본 Secret 전송, Supabase 변경, Production 배포, commit·push·merge·release다.

INPUTS / SOURCE OF TRUTH: 복구 PASS backup manifest, Google Drive profile·permission metadata, 업로드 readback, 현재 사용자의 명시적 P4-G3 실행 요청이다.

AUTHORITY / PERMISSIONS: 현재 요청은 이 P4-G3 외부 전송과 서명에만 유효하다. 목적지는 회사 도메인 계정의 비공개 폴더로 제한한다.

SUCCESS / FAILURE: 독립 공급자, owner-only, 원본·readback bytes와 SHA-256 일치, 업무·보안·운영 3/3 승인, staging 3/3 healthy와 보호 PID 보존이 모두 필요하다.

VERIFICATION / OUTPUTS: Drive profile·metadata·raw readback, 로컬 Get-FileHash, Docker health, 공개 health/readiness, listener PID를 JSON·Phase 보고서에 기록한다.

STOP CONDITION: P4를 완료하고 P5의 로컬 UAT 사전점검 한 건만 READY로 설정한다. Production은 NO-GO로 유지한다.
