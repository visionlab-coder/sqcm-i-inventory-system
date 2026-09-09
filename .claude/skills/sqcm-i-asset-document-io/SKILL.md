---
name: sqcm-i-asset-document-io
description: SQCM-i 비품관리에서 문서·이미지·ZIP을 자산목록으로 가져오거나 자산 보고서를 Excel·Word·PPT·JPEG·PNG로 내보낼 때 사용한다.
---

# SQCM-i 자산 문서 입출력

## 사람 조작

1. 관리자 또는 담당자로 로그인하고 `자산 등록`을 연다.
2. `자산 문서 선택`에서 지원 파일을 고르고 `자동 추출·미리보기`를 누른다.
3. 원본명, 추출 방식, 전체·등록 가능·수정 필요 수와 행별 오류를 확인한다.
4. 오류가 있으면 원본을 수정해 다시 미리보기한다. 오류가 없을 때만 `자산 등록 확정`을 누른다.
5. 내보내기는 `보고서`에서 필터를 적용한 후 Excel, Word, PPT, JPEG, PNG 중 하나를 선택한다.

## 에이전트 조작

- 가져오기 미리보기: `POST /api/enterprise/assets/import/document/preview`
- 가져오기 확정: `POST /api/enterprise/assets/import/document/commit`
- 원본 bytes를 body로 보내고 `x-file-name`, `content-type`, CSRF, idempotency key를 포함한다.
- 확정에는 미리보기에서 받은 `x-source-checksum`과 `x-import-checksum`을 그대로 결박한다.
- 내보내기: `GET /api/enterprise/reports/assets.{xlsx|docx|pptx|jpeg|png}`와 동일한 보고서 filter query를 사용한다.
- 응답·로그·문서에 파일 원문, Secret, 개인정보를 복사하지 않는다.

## 형식 계약

- 결정적 표 추출: CSV, TXT/TSV, Markdown 표, XLSX, DOCX 표, PPTX 표, HWPX 표.
- 구조화 OCR 필요: PDF, JPG/JPEG, PNG, DOC, XLS, PPT, HWP.
- ZIP은 지원 파일 1~10개를 허용하며 같은 헤더만 결합한다. 중첩 ZIP은 금지한다.
- 최대 원본 10 MiB, 압축 해제 합계 20 MiB, 항목 100개, 최대 자산 500개다.
- DOCM, XLSM, PPTM, 암호화 압축, 경로 이탈, 비정상 압축률은 차단한다.

## 검증과 실패

- 모든 가져오기는 `asset.create`, 모든 내보내기는 `report.read` 권한과 조직·부서 scope를 유지한다.
- 악성코드 상태는 정확히 `clean`일 때만 추출한다.
- OCR은 `asset-import-v1`의 구조화 `rows` 또는 `fields.assets`가 없으면 성공으로 처리하지 않는다.
- 미리보기 후 원본 또는 표준 자산표 checksum이 달라지면 확정하지 않는다.
- 행 오류 하나라도 있으면 자산을 하나도 INSERT하지 않는다.
- 검증: `node --test test/unit/asset-document-import-service.test.js test/unit/asset-report-export-service.test.js test/unit/asset-import-route.test.js` 및 `npm.cmd run check`.
