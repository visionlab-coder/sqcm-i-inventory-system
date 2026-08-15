const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateThreeServiceContract } = require('../../src/operations/compose-contract');

test('개발과 production Compose는 frontend/backend/database 3서비스만 허용한다', () => {
  const root = path.join(__dirname, '..', '..');
  const result = validateThreeServiceContract(
    fs.readFileSync(path.join(root, 'compose.yaml'), 'utf8'),
    fs.readFileSync(path.join(root, 'compose.production.yaml'), 'utf8')
  );
  assert.deepEqual(result.services, ['backend', 'database', 'frontend']);
  assert.equal(result.count, 3);
});

test('production override가 별도 worker 서비스를 추가하면 거부한다', () => {
  const base = 'services:\n  frontend:\n  backend:\n  database:\n';
  const production = 'services:\n  automation-worker:\n';
  assert.throws(() => validateThreeServiceContract(base, production), /forbidden services/);
});
