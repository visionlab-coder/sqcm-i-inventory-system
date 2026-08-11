# AI PC 브리지 활성화 계획 보고서

## 현재 판정

비품관리 시스템 쪽 provider adapter와 rules fallback은 준비되어 있다. 그러나 AI PC의 실제 브리지 endpoint·포트·모델·health 응답이 아직 제공되지 않았으므로 외부 coordination 단계는 미착수다.

현재 상태:

- 기존 LM Studio 봇 보존: 완료 원칙
- 비품관리 backend 규칙 기반 추천: 사용 가능
- 외부 provider adapter: 구현 완료
- AI PC 전용 브리지: 외부 AI PC에서 구축 필요
- staging 실제 모델 호출: endpoint 수신 후 진행
- Production 승격: 보류

## 권장 실행 순서

1. AI PC의 Codex에 Phase 66 메타프롬프트 전달
2. 기존 소놀봇/LM Studio를 변경하지 않고 브리지 endpoint 생성
3. `/health` 결과와 `/recommend` 샘플 응답을 전달
4. backend를 staging에서 브리지에 연결
5. 30~50개 샘플 평가와 관리자 승인 테스트
6. 평가 승인 후에만 전용 runtime·운영 승격 검토

## 다음 입력

AI PC에서 다음 네 가지를 받아야 한다.

- 브리지 URL 및 포트
- `/health` 응답
- 실제 모델 식별자
- `/recommend` 정상 응답 샘플

이 정보가 오기 전에는 기존 봇에 접근하거나 설정을 변경하지 않는다.
