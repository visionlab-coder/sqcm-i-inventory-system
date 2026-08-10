# Phase 65 외부 AI provider 연결 보고서

## 결론

외부 AI/OCR provider를 연결할 수 있는 실제 HTTP adapter와 운영 계약을 구현했다. 현재 Docker 개발 환경은 `AI_PROVIDER_DRIVER=rules`이므로 외부 모델 호출은 의도적으로 하지 않았다. 따라서 구현 상태는 **External AI Integration Ready**, 실제 모델 연결 상태는 **미구성**이다.

## 구현 내용

- `src/adapters/http-ai-provider.js` 추가
  - 추천·OCR·healthCheck
  - timeout과 HTTP 오류 처리
  - Bearer API key 헤더 처리
  - JSON/code-fence 응답 정규화
  - 추천 usage 정규화
- `src/config.js`
  - `AI_PROVIDER_URL`
  - `AI_PROVIDER_OCR_URL`
  - `AI_PROVIDER_HEALTH_URL`
  - `AI_PROVIDER_MODEL`
  - `AI_PROVIDER_TIMEOUT_MS`
  - built-in external endpoint 누락·production HTTPS 차단
- `src/adapters/loader.js`
  - `AI_PROVIDER_DRIVER=external`일 때 built-in HTTP adapter 로드
- `src/app.js`
  - aiProvider 운영 계약을 앱 생성 시에도 재검증
- Cost Command Center
  - 현재 provider/model을 사용자에게 표시해 rules fallback과 외부 AI를 구분
- `compose.yaml`
  - AI provider 환경변수 전달 경로 추가

## 검증 증거

| 검증 | 결과 |
|---|---:|
| JavaScript syntax | 84개 PASS |
| Unit tests | 101/101 PASS |
| UI contract | 13/13 PASS |
| Docker integration | 20/20 PASS |
| Database migrations | 22/22 일치 |
| 375px browser | 수평 overflow 없음, 메뉴 accessible name 확인 |
| 1440px browser | 수평 overflow 없음, main content 정상, 콘솔 오류 0건 |

## 실제 AI 연결 여부

현재 실행 환경의 provider는 다음과 같다.

```text
AI_PROVIDER_DRIVER=rules
provider=rules-and-adapters
modelVersion=cost-control-v1
```

외부 AI를 실제 활성화하려면 운영 secret 관리 시스템에서 `AI_PROVIDER_DRIVER=external`, provider URL 3종, model, API key를 주입하고 해당 provider의 추천·OCR·health 계약을 staging에서 검증해야 한다. 이 작업은 외부 데이터 전송과 비용 승인이 필요하므로 이번 Phase에서는 수행하지 않았다.
