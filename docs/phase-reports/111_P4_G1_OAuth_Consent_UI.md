# P4-G1 OAuth Consent UI 결과

기준일: 2026-08-31

결과: **로컬 구현 PASS / live OAuth flow NOT RUN**

- `/oauth/consent`에 UAT 로그인, 요청 scope 표시, 승인·거부, 로딩·오류 상태를 구현했다.
- Supabase Auth session은 `persistSession:false`, `autoRefreshToken:false`로 브라우저 저장소에 남기지 않는다.
- Publishable key는 공개 config에만 사용하며 비밀번호·access token은 출력·문서·Git에 기록하지 않는다.
- CSP는 전용 Supabase project 연결만 허용하고 HTML은 `no-store`다.
- `@supabase/supabase-js@2.112.4`, `esbuild@0.28.2` exact 버전, bundle 214.3 KiB가 빌드됐다.
- syntax 117, unit 139/139, UI contract 20, Compose 3서비스, frontend Docker image build가 PASS했다.
- loopback 브라우저에서 missing `authorization_id` 오류 상태와 접근성 tree를 확인했다. 실제 authorization_id를 사용한 approve/deny·callback은 non-seed staging 미배포로 NOT RUN이다.

다음 READY는 같은 P4 G1 안의 non-seed staging deployment와 live consent/provider probe다.
