# SQCM-i 다중 서식 자산 문서 입출력 메타프롬프트

기준일: 2026-09-09

## 1. 목적

Excel 중심의 기존 원장을 Word·한글·PowerPoint·텍스트·PDF·이미지·ZIP에서도 안전하게 받아 표준 자산목록으로 변환하고, 사용자가 검토·확정한 경우에만 통합 원장에 반영한다. 필터된 자산목록은 Excel·Word·PowerPoint·JPEG·PNG로 내보낸다.

## 2. 범위와 비범위

- 범위: CSV, TXT, MD, XLS/XLSX, DOC/DOCX, HWP/HWPX, PPT/PPTX, PDF, JPG/JPEG, PNG, ZIP 업로드 계약과 XLSX, DOCX, PPTX, JPEG, PNG 내보내기.
- 범위: 확장자·magic byte, 압축 안전성, 악성코드 검사, 문서 추출, 행별 검증, 미리보기 checksum, 원자적 확정, 감사 로그.
- 비범위: 매크로 실행, 암호 해제, 임의 스크립트 실행, 미리보기 없는 자동 쓰기, 운영 Secret 출력, 외부 문서 원문 영구 보존.
- 매크로 포함 Office, 암호화 ZIP, 중첩 ZIP, 경로 이탈, 압축 폭탄은 차단한다.

## 3. 처리 방식

`파일 선택 → 권한 확인 → 형식·크기 검사 → 악성코드 검사 → 결정적 표 추출 또는 구조화 OCR → 기존 CSV 검증기로 정규화 → 행별 미리보기 → 원본·변환 checksum 재확인 → 단일 트랜잭션 확정 → 감사·outbox`

직접 표 형식은 결정적으로 처리한다. PDF·이미지·레거시 OLE 문서는 연결된 OCR 공급자가 `asset-import-v1` 구조화 행을 반환할 때만 진행하며, 공급자가 없거나 행이 없으면 fail-closed한다.

## 4. 입력 정본

1. 현재 사용자 요구와 승인 경계
2. `src/services/asset-import-service.js`의 열 별칭·행 검증·원자적 확정 계약
3. 현재 조직·부서 범위와 기준정보
4. 실제 업로드 bytes, 원본명, Content-Type, checksum
5. 실제 보고서 필터와 DB 조회 결과

## 5. 권한

- 가져오기: `asset.create`
- 내보내기: `report.read`
- 로컬 코드·테스트·문서·기능 스킬 변경과 exact allowlist 체크포인트는 허용된 개발 범위다.
- Production 배포, 외부 OCR 원문 전송, Secret·계정 변경은 별도 운영 Gate와 승인 없이는 실행하지 않는다.

## 6. 성공·실패 기준

- 성공: 파일이 안전성 검사를 통과하고 표준 자산 행으로 변환되며, 기존 행 검증을 모두 통과한 뒤 사용자가 확정한 경우에만 전체가 원자적으로 기록된다.
- 성공: 다섯 내보내기 형식이 실제 열 수 있는 파일 signature·content type·한국어 자산 내용을 가진다.
- 실패: 파일/내용 불일치, 악성코드 unknown/infected/timeout, 압축 위험, OCR 미구성·무행, 행 오류, checksum 변경, 범위 위반 중 하나라도 발생한다.

## 7. 검증 증거

- `node --test test/unit/asset-document-import-service.test.js test/unit/asset-report-export-service.test.js test/unit/asset-import-route.test.js`
- `npm.cmd run check`
- `npm.cmd run ui:contract`
- `npm.cmd audit --json`
- Production 반영 후 실제 역할 계정 브라우저 미리보기·확정 취소·다운로드·감사 로그 UAT

## 8. 산출물

- 가져오기·내보내기 서비스와 API·UI
- `.agents/skills/sqcm-i-asset-document-io` 및 Claude 미러
- `agent docs/harness/FEATURE_SKILL_REGISTRY.json`
- 사람용 체크리스트와 Secret 없는 기계 증거 JSON

## 단계

- D0 계약·위험 분류
- D1 다중 서식 안전 추출
- D2 다중 서식 내보내기
- D3 API·UI·기능 스킬 연결
- D4 단위·회귀·보안 검증 및 Git 체크포인트
- D5 Production 배포·실제 직원 UAT(별도 운영 Gate)
