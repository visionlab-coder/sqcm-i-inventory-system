# 운영 전환·UAT 실행 패키지

## 1. 책임 분리

| 역할 | 제공할 입력 | 승인 증거 |
|---|---|---|
| 인프라 | 운영 URL, DNS/TLS, 저장소, 배포 권한 | endpoint 및 배포 로그 |
| 보안 | IdP, 검사기, Secret Manager 참조 | OIDC·검사·Secret 검토 결과 |
| DB 운영 | 백업 저장소, RPO/RTO, migration 창구 | 격리 복구 결과 |
| 업무 | 직원·부서장·관리자 UAT 계정과 시나리오 | 결함 종료 및 서명 |

실제 비밀번호·토큰·인증서·세션은 이 저장소의 manifest나 증거 파일에 기록하지 않는다.

## 2. 공급자 사전검증

1. `config/operations.manifest.example.json`을 저장소 밖 승인된 작업 위치로 복사한다.
2. `template`을 제거하고 실제 HTTPS endpoint와 Secret Manager 참조 URI를 입력한다.
3. 구조 검사: `npm run operations:preflight -- <manifest.json>`
4. 실제 도달성 검사: `npm run operations:preflight -- <manifest.json> --probe`
5. OIDC discovery, frontend health, backend readiness, 저장소, 검사기 결과를 전환 증거에 연결한다.

`--probe`는 OIDC issuer의 discovery 문서와 HTTPS/TLS 연결을 검증한다. 저장소·검사기는 인증 실패 401/403까지 “도달 가능”으로 보지만 5xx·timeout·TLS 실패는 차단한다.

## 3. staging 전환 리허설

빌드 → 단위·통합 → 이미지 → 백업·격리 복구 → migration 검토 → staging 배포 → health/readiness → 로그인·조회·쓰기 smoke → 5xx 로그 → rollback 순으로 수행한다.

다음 경우 즉시 rollback한다.

- health/readiness가 200이 아님
- migration 버전 또는 필수 테이블 수 불일치
- 로그인·권한 역조건·핵심 쓰기 중 하나라도 실패
- 비정상 5xx 또는 감사 로그 누락
- 외부 저장소·검사기가 fail-open으로 동작

## 4. UAT와 최종 게이트

`docs/UAT-checklist.md`를 실제 URL과 역할별 계정으로 수행한다. 결함은 ID·재현·기대·실제·담당자·상태를 기록한다. 완료 후 `docs/templates/cutover-evidence.example.json`을 복사해 다음 12개 증거를 채운다.

1. Artifact
2. 백업·격리 복구
3. migration 검토
4. 공급자 preflight
5. health/readiness
6. 핵심 smoke
7. 로그·5xx
8. rollback
9. UAT 서명
10. CSRF·멱등성
11. 운영 health·백업·경보
12. 비기능·장애복구

업무·보안·운영 책임자의 이름과 승인 시각까지 입력한 뒤 다음을 실행한다.

```text
npm run operations:cutover-gate -- <cutover-evidence.json>
```

하나라도 PENDING이거나 증거·서명이 비어 있으면 전환은 차단된다. 예제 템플릿의 계약 검사 통과는 production 승인이 아니다.

## 5. GitHub 공유

`Frosty city man`은 범소프트 팀장이며 GitHub 협업자·reviewer 연결 대상이 아니다. 저장소 소유·커밋·PR·릴리스 계정은 `visionlab-coder` 하나만 사용하며 별도 collaborator 초대를 만들지 않는다.
