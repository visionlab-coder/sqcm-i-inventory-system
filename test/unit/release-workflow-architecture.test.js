const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('release workflow는 OCI A1용 ARM64와 기존 AMD64 이미지를 함께 게시한다', () => {
  const workflow = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'release-images.yml'), 'utf8');
  assert.match(workflow, /docker\/setup-qemu-action@[a-f0-9]{40}/);
  const platformContracts = workflow.match(/platforms: linux\/amd64,linux\/arm64/g) || [];
  assert.equal(platformContracts.length, 2);
  assert.match(workflow, /persist-credentials: false/);
});

test('quality workflow는 main 병합 없이 승인된 branch를 수동 검증할 수 있다', () => {
  const workflow = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'quality.yml'), 'utf8');
  assert.match(workflow, /^\s{2}workflow_dispatch:\s*$/m);
  assert.match(workflow, /^permissions:\s*\n\s{2}contents:\s*read\s*$/m);
});

test('quality 통합 Job은 고정 호스트 포트 대신 CI 실행별 loopback 포트를 사용한다', () => {
  const compose = fs.readFileSync(path.join(process.cwd(), 'compose.test.yaml'), 'utf8');
  const writer = fs.readFileSync(path.join(process.cwd(), 'scripts', 'write-ci-env.mjs'), 'utf8');
  const workflow = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'quality.yml'), 'utf8');

  assert.match(compose, /127\.0\.0\.1:\$\{CI_POSTGRES_HOST_PORT:\?[^}]+\}:5432/);
  assert.match(compose, /127\.0\.0\.1:\$\{CI_BACKEND_HOST_PORT:\?[^}]+\}:8080/);
  assert.match(writer, /listen\(0, '127\.0\.0\.1'/);
  for (const name of ['FRONTEND_PORT', 'CI_POSTGRES_HOST_PORT', 'CI_BACKEND_HOST_PORT', 'INTEGRATION_DATABASE_URL']) {
    assert.match(writer, new RegExp(`\\b${name}\\b`));
  }
  assert.doesNotMatch(workflow, /localhost:3000/);
});
