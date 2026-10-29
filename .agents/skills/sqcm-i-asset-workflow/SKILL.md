---
name: sqcm-i-asset-workflow
description: 비품 자산 배정·반납 사진·수리 접수를 브라우저와 실제 API/DB로 검증한다. 직원 계정 설정·실제 자산 변경·검사 우회·운영 배포는 포함하지 않는다.
---

# 배정·반납·수리 세로 검증

현재 승인과 운영 revision을 확인하고 기존 로그인·계정·실제 자산을 보존한다. 새 고유 합성 자산만 만들고 취득가0·실물 없음 표식을 사용한다. `scripts/production-asset-workflow-uat.mjs`의 고정 날짜/표식/actor는 일회성 계약이며 재사용 전 현재 승인과 충돌 여부를 확인해야 한다. 이미 생성된 baseline·성공 요청을 재생성하지 않는다.

배정·반납 화면에서 ASSIGN 초안을 만들고 제출한다. 요청자와 다른 승인된 UAT 관리자가 기존 승인 단계를 처리한다. API 승인은 브라우저 승인 증거가 아니다. 내 비품의 ASSIGNED와 실제 활성 배정1건을 대조한다. 반납은 현재 배정받은 사람만 요청하며 GOOD/DAMAGED/MISSING_PARTS·부속품·메모와 합성임을 표시한 PNG/JPEG가 필요하다. 사진이 검사·저장된 후 제출·독립 승인하면 ENDED 배정·RETURNED·반납 기록·사진 연결이 함께 있어야 성공이다. 사진 실패를 반납 성공으로 취급하거나 재제출로 초안을 늘리지 않는다. 기존 반납 초안은 **내 비품 → 내 요청 → 반납 사진 재업로드**로 재개한다. 대화상자의 초안 번호를 확인하고 JPEG/PNG를 선택해 기존 초안 사진 재업로드·제출을 누른다. 원래 반납 상태/메모/부속품은 유지되고 오류는 대화상자 안에 남는다. 업로드 성공 뒤 제출만 실패하면 업로드된 사진으로 제출만 재시도한다. 닫기는 화면만 닫으며 초안을 취소하지 않는다. 완료/다른 사람 요청에는 복구 버튼을 제공하지 않고 서버 권한을 그대로 적용한다. `frontend/return-draft-recovery.js`와 `test/unit/return-draft-recovery.test.js`가 동일 ID·중복 클릭·실패 재시도·계정 변경 차단을 검증한다.

수리 관리에서 같은 시험 자산의 고장 접수 OPEN과 진행 IN_PROGRESS를 확인한다. 이는 self-service REPAIR 승인 워크플로와 별도 기능이므로 서로 통과를 대신하지 않는다. 종료 시 해당 시험 ticket만 정상 API로 CANCELLED 처리하고 비용을 보내지 않는다. 기존 배정/요청/수리/정책/직원 행은 쓰지 않는다.

`--baseline`은 충돌·기존 정책·actor와 데이터 지문을 저장한다. `--observe`는 소유 시험 자산/연결 기록과 보존을 읽는다. `--approve TYPE`은 현재 SUBMITTED1건만 별도 UAT로 승인한다. `--permission`은 USER 승인/비배정자 반납403을 확인한다. `--park`는 시험 수리 건만 취소하고 차단 중인 배정·초안은 남긴다. `--finalize`는 활성 배정·초안이 없을 때만 정상 정책으로 시험 자산 폐기·비활성화를 허용한다. `--verify`는 실제 반납/사진/정리를 검증하며 미실행을 숨기지 않는다.

검사 health200이라도 실제 scan이 unknown일 수 있다. 구성된 Defender 실행파일 존재·버전과 실제 업로드 결과를 대조한다. 버전 고정 경로가 삭제되면 Microsoft 서명과 실제 합성 scan0을 확인한 `Platform/CurrentVersion/MpCmdRun.exe` 후보를 검토하되 현재 승인 없이 변경하지 않는다. 누락 경로, timeout, unknown에는 fail-closed를 유지한다. 브리지 설정·서비스 재기동 승인 없이 경로 변경, 프로세스 종료, clean receipt 위조나 직접 SQL 배정 종료를 하지 않는다. frontend만 배포할 때 승인 runtime의 `FRONTEND_RELEASE_TAG`를 검증 SHA로 지정하고 공용 `RELEASE_TAG`/backend/DB는 유지한다. `test/unit/enterprise-service.test.js`, `approval-service.test.js`, `return-service.test.js`, `repair-service.test.js`와 실제 브라우저/DB 증거를 분리한다. 남은 시험 상태와 정확한 재개 Gate를 보고한다.
