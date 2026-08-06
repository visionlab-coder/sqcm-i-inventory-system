# Canva·Figma 레퍼런스 기반 UI 개편

## 조사 출처

- [Figma Dashboard templates](https://www.figma.com/templates/dashboard-designs/): 단일 대시보드 형식이 아니라 분석, CRM, 물류, 다크 모드 등 목적별 레이아웃 변주
- [Figma Design systems](https://www.figma.com/design-systems/): 토큰·변수·컴포넌트는 공통화하되 테마와 맥락별 모드 지원
- [Figma Inventory dashboard generator](https://www.figma.com/solutions/ai-inventory-management-dashboard-generator/): 실제 재고·부족·발주 흐름을 데이터로 검증하고 브랜드 시스템과 연결
- [Canva Visual hierarchy](https://www.canva.com/learn/visual-hierarchy/): 크기, 색·대비, 3단계 타이포, 여백으로 시선의 1·2·3순위 설계
- [Canva Company templates](https://www.canva.com/presentations/templates/company/): 미니멀, 볼드, 건설, 기하학 등 한 브랜드 안에서도 목적별 조형 언어 변주

## 기존 문제

- 모든 페이지가 네이비 사이드바, 흰 카드, 동일 KPI 네 칸, 표 한 장으로 반복됨
- 기능명만 바뀌고 정보 구조와 사용 맥락은 시각적으로 구분되지 않음
- AI가 자주 만드는 둥근 카드형 SaaS 대시보드 인상이 강함
- 중요도와 행동 순서가 카드 크기에 반영되지 않음

## 새 원칙

공통화 대상은 공식 로고, 색 토큰, 입력·버튼 상태, 접근성 규칙이다. 페이지 레이아웃은 업무에 따라 바꾼다. 한 화면에는 하나의 강한 초점을 두며 주황은 조치, 청록은 정보, 라임은 긍정적 진행에만 사용한다.

## 페이지별 아키타입

1. 로그인: 1991 헤리티지 에디토리얼 히어로
2. 대시보드: 비대칭 현장 지휘판
3. 자산 목록: 비교 중심 장비 카탈로그
4. 자산 상세: 도면·기술 명세 시트
5. 자산 등록: 4단계 문서형 마법사
6. 배정·반납: 스캔 우선 키오스크
7. 요청함: 상태 이동 칸반
8. 실사: 모바일 필드 모드
9. 수리: 사건 타임라인
10. 보고서: 인쇄형 편집 디자인
11. 관리자: 역할·권한 매트릭스

## 메타프롬프트

ROLE: 현장 업무와 브랜드 시스템을 함께 설계하는 엔터프라이즈 UX 디렉터다.

GOAL: 서원토건 공식 로고와 공통 토큰을 유지하면서 각 페이지의 업무 목적이 첫 3초 안에 구별되는 화면을 만든다.

CONSTRAINTS: 둥근 KPI 카드 4개 반복 금지. 모든 페이지에 동일한 레이아웃 사용 금지. 주황은 조치, 청록은 정보, 라임은 진행에만 사용. 표가 핵심이 아닌 업무는 칸반·타임라인·스테퍼·매트릭스 중 적합한 구조를 사용. 접근성과 실제 데이터 흐름을 유지한다.

CHECK: 페이지별 초점이 다른가, 업무 흐름이 형태에 반영됐는가, 공식 로고가 유지되는가, 모바일에서 핵심 행동이 남는가, 기능 테스트가 통과하는가.
