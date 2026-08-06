const required = ['INTEGRATION_BASE_URL', 'INTEGRATION_DATABASE_URL'];
const missing = required.filter(name => !process.env[name]);

if (missing.length) {
  console.error(`통합 테스트 필수 환경변수가 없습니다: ${missing.join(', ')}`);
  console.error('Docker 3계층을 실행하고 README의 통합 테스트 환경변수를 설정하세요.');
  process.exit(2);
}
