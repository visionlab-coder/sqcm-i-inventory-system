# Phase 7 변경 보고서 — 컨셉아트·HTML mock 메타데이터 제거

## 범위

- `mock/concept/pages/index.html`
- `mock/html/index.html`
- `mock/concept` 아래 PNG 12개

## 제거 내용

- `HTML Mock`, `Diverse UI Direction` 제목 표기
- Canva·Figma·reference·authored·archetype 등 제작 설명
- 페이지별 아키타입 번호·설명·태그와 제작 푸터
- PNG 12개에 포함된 `caBX` 제작·출처 메타데이터 청크

## 유지 내용

- HTML 문자 인코딩과 반응형 viewport
- 공식 SEOWON 로고와 접근성 대체 텍스트
- 페이지 이름, 실제 UI 문구와 예시 업무 데이터
- PNG의 해상도, 색상·픽셀을 구성하는 `IHDR`·`IDAT`·`IEND`

## 검증 기준

- [x] 공개 제작 메타데이터 문구 제거
- [x] PNG 12개에서 `caBX` 제거
- [x] 모든 PNG가 정상 로드되고 해상도 유지
- [x] 컨셉 11개와 HTML mock 브라우저 렌더링
- [x] Git diff 검사
- [x] GitHub 반영 대상 포함
