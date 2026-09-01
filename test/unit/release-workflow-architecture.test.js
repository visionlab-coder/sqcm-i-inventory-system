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
