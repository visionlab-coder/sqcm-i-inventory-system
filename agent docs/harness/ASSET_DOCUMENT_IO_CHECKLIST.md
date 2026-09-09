# 다중 서식 자산 문서 입출력 체크리스트

기준일: 2026-09-09

## 진행 시각화

`D0 계약 ✅ → D1 가져오기 ✅ → D2 내보내기 ✅ → D3 API·UI·스킬 ✅ → D4 전체 검증·Git 체크포인트 ✅ → D5 Production 배포·직원 UAT ⬜`

## 1. 요구사항·권한

- [x] 지원 업로드·내보내기 형식 계약
- [x] `asset.create`와 `report.read` 권한 분리
- [x] 미리보기와 실제 DB 확정 분리
- [ ] Production 배포 승인·변경창 확인

## 2. 데이터 정확성

- [x] 기존 열 별칭·기준정보·부서 scope 검증 재사용
- [x] 원본 checksum과 변환 checksum 재검증
- [x] 행 오류가 있으면 전체 쓰기 차단
- [x] ZIP 복수 파일은 동일 헤더만 결합

## 3. 보안

- [x] 악성코드 `clean`만 허용
- [x] 확장자와 magic byte 대조
- [x] 매크로·암호화 ZIP·중첩 ZIP·경로 이탈·압축 폭탄 차단
- [x] 입력 크기·압축 해제 크기·항목·행 수 제한
- [x] 의존성 취약점 0건 확인

## 4. 화면·접근성

- [x] 한 화면에서 형식, 한도, OCR 조건 안내
- [x] 추출 방식·등록 가능·수정 필요·행 오류 표시
- [x] 사용자의 명시적 확정 전에는 원장 미변경
- [x] 보고서 필터와 다섯 내보내기 버튼 연결

## 5. 테스트

- [x] TXT·Markdown·XLSX·DOCX·ZIP·OCR 경로 단위시험
- [x] Excel·Word·PPT·JPEG·PNG 실제 파일 signature 시험
- [x] API 권한·다운로드 route 시험
- [x] 전체 `npm.cmd run check` — 1,038건, PASS 1,030 / FAIL 0 / SKIP 8
- [x] `npm.cmd run ui:contract` — 41개 계약 PASS

## 6. 기능-스킬 수명주기

- [x] 사람 조작과 에이전트 API 조작 문서화
- [x] Codex·Claude 스킬 동일 내용 작성
- [x] 스킬 구조와 mirror SHA-256 검증 — `BB2A09F540E29033FD903D76F917BA25C6E8D5C15D0517F73E327FA51F7F34BD`
- [x] 기능 등록부 갱신·JSON 검증

## 7. 배포·운영

- [x] exact allowlist Git checkpoint commit·push(이 체크리스트를 포함하는 D4 완료 게이트)
- [ ] 운영 이미지 빌드·배포
- [ ] 실제 직원 역할 계정으로 업로드 미리보기·취소·확정 UAT
- [ ] 실제 OCR provider receipt와 감사 로그 확인
- [ ] 다섯 내보내기 파일을 Office·이미지 뷰어에서 시각 확인

현재 판정: `LOCAL_VERIFIED_PRODUCTION_NOT_RUN`. Production 활성화는 아직 주장하지 않는다.

로컬 운영 이미지 `sqcm-i-inventory:asset-document-io-local`은 Node 24 Alpine에서 의존성 취약점 0건으로 빌드됐고 두 신규 서비스를 실제 require했다. 이 이미지는 Production에 배포하지 않았다.
