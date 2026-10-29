---
name: sqcm-i-asset-metadata
description: 비품관리 자산 상세의 기본정보 수정·취소·변경 이력·동시수정 충돌을 조작하고 검증한다. 계정·상태·비용·부서 변경은 포함하지 않는다.
---

# 자산 기본정보 수정

ADMIN 또는 MANAGER가 허용된 조직·부서의 자산 목록에서 상세를 연다. 기본정보 수정에서 자산명·일련번호·분류·모델·위치·취득일과 수정 사유를 입력하고 저장한다. 변경된 명칭·값과 기본정보 변경 이력의 전후 값·사유·작업자·시각을 확인한다. 입력 취소는 저장하지 않고 최신 상세를 다시 읽는다. 분류 변경 시 불일치 모델은 선택 해제된다.

API는 `GET /api/enterprise/assets/:id`의 `asset.edit_version`을 읽고 `PATCH /api/enterprise/assets/:id`에 `expectedVersion`, 2~500자 `reason`과 허용 필드만 보낸다. 미지정 값은 null/빈 값으로 지울 수 있다. 자산번호·조직·부서·취득가·상태·속성을 보내면400이다. `asset.update`와 조직·부서 범위를 서버에서 검사하며 USER403/비로그인401이다. 같은 조직의 활성 기준정보와 모델-분류 일치를 확인한다.

동시수정409(`ASSET_EDIT_CONFLICT`)에서는 입력을 유지하고 최신 정보 버튼으로 원본을 확인한다. 사용자 동의 없이 덮어쓰기·반복 제출하지 않는다. 취소/폐기 자산은409, 미변경 저장400이며 이력을 추가하지 않는다. 단일 트랜잭션으로 asset와 audit를 저장한다. 이력은 현재 자산 조회 권한 안에서 최근100건만 제공한다.

검증은 `node --test test/unit/asset-metadata-service.test.js`, 격리 `test/integration/http-smoke.test.js`의 기본정보 수정 시험, 실제 브라우저의 등록→수정→재조회·이력·취소·PC/모바일 흐름이다. 실제 운영 시험은 명시된 시험 자산·전용 UAT 계정만 사용한다. `scripts/production-asset-edit-uat.mjs`는 준비·검증·정리 전용이며 사용 전 현재 승인·고유 표식·보존 계약을 읽는다. 직원 계정·실제 자산·원문 Secret은 사용·변경·기록하지 않는다. 기본정보 수정은 자산 상태 변경과 구분한다.
