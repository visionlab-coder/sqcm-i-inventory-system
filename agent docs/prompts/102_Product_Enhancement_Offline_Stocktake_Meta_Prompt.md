# PE-C3 오프라인 재물조사 PWA 실행 계약

기준일: 2026-09-04 KST

## 1. 목적

현장 네트워크가 끊겨도 담당자가 재물조사 결과를 안전하게 기록하고, 재연결 시 중복 생성 없이 서버 변경과 충돌을 검토하며 동기화한다.

## 2. 범위

PWA shell cache, IndexedDB 조사 snapshot·전송 큐, 재연결 동기화, operation UUID 멱등성, 항목 version 충돌, 모바일·접근성·브라우저 증거를 포함한다. 일반 자산 수정의 오프라인화, 백그라운드 위치추적, RFID·GPS와 Production 배포는 제외한다.

## 3. 처리 방식

`역조건 테스트 → DB version/receipt → sync API → IndexedDB/PWA → offline/online 브라우저 → 증거 → exact allowlist Git` 순서로 진행한다. 기존 온라인 재물조사와 QR 흐름을 교체하지 않고 확장한다.

## 4. 입력 정본

사용자 요구, 프로젝트 지침, 제품 고도화 로드맵, 기존 stocktake API/DB/UI, 실제 테스트·브라우저 순으로 판정한다.

## 5. 권한

로컬 코드·테스트·문서, 로컬 application DB forward migration과 합성 시험데이터만 허용한다. Production·staging·실제 계정·외부 메시지·Secret은 변경하지 않는다.

## 6. 성공·실패 기준

오프라인 저장 후 재연결 동기화, 동일 operation 재전송의 중복 무효화, 서버 version 변경 충돌 보존, 조직·부서 권한 차단, 390×844 사용성이 모두 PASS해야 한다. 큐 유실·묵시적 덮어쓰기·인증 우회·실행하지 않은 브라우저 검증은 실패다.

## 7. 검증 증거

구문·단위·migration, PostgreSQL HTTP, offline/online Chrome, IndexedDB 큐 잔존·제거, service-worker 범위, 3서비스 health, Git diff·Secret scan을 기록한다.

## 8. 산출물

forward migration, offline sync service/API, PWA/IndexedDB UI, 단위·통합·브라우저 시험, 기계 증거 JSON, 7범주 체크리스트와 완료 commit·push를 남긴다.
