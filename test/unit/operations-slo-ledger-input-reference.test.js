const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const inputModule = import('../../src/operations/operations-activation-input-reader.mjs');
const sloModule = import('../../src/operations/operations-slo-collector.mjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-slo-ledger-input-'));
  const repositoryRoot = path.join(root, 'repository');
  const ledgerRoot = path.join(root, 'ledger');
  fs.mkdirSync(repositoryRoot);
  fs.mkdirSync(ledgerRoot);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { repositoryRoot, ledgerRoot };
}

function sample(day = '2026-09-12') {
  return {
    schemaVersion: 1,
    environment: 'production',
    activationState: 'actual',
    measurementType: 'PRODUCTION_HTTPS_MONITORING_SAMPLE',
    targetUrl: 'https://inventory.safe-link.co.kr',
    timestamp: `${day}T01:00:00.000Z`,
    available: true,
    latencyMs: 100
  };
}

test('SLO JSONL ledger는 저장소 밖 physical UTF-8 파일을 64KiB 이하로 읽는다', async (t) => {
  const { readOperationsTextInput } = await inputModule;
  const { repositoryRoot, ledgerRoot } = fixture(t);
  const file = path.join(ledgerRoot, 'slo.jsonl');
  fs.writeFileSync(file, `${JSON.stringify(sample())}\n`);
  const input = readOperationsTextInput(file, { repositoryRoot });
  assert.match(input.value, /PRODUCTION_HTTPS_MONITORING_SAMPLE/);
  assert.equal(input.bytes, fs.statSync(file).size);
  assert.match(input.sha256, /^[a-f0-9]{64}$/);
});

test('SLO ledger append는 64KiB 초과 기존 파일을 파싱 전에 거부한다', async (t) => {
  const { OPERATIONS_TEXT_INPUT_MAX_BYTES } = await inputModule;
  const { appendSloSampleOnce } = await sloModule;
  const { repositoryRoot, ledgerRoot } = fixture(t);
  const file = path.join(ledgerRoot, 'slo.jsonl');
  fs.writeFileSync(file, Buffer.alloc(OPERATIONS_TEXT_INPUT_MAX_BYTES + 1, 0x61));
  assert.throws(
    () => appendSloSampleOnce(file, sample('2026-09-13'), { repositoryRoot }),
    /OPERATIONS_TEXT_INPUT_REFERENCE_INVALID/
  );
});

test('SLO collector 진입점은 P6 Gate 전에 ledger를 읽지 않고 bounded reader만 사용한다', () => {
  const root = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(root, 'scripts', 'operations-slo-collector.mjs'), 'utf8');
  assert.match(source, /let sampleCount = 0/);
  assert.match(source, /readSloLedgerFile\(ledgerPath/);
  assert.doesNotMatch(source, /fs\.readFileSync\(ledgerPath/);
  assert.doesNotMatch(source, /let sampleCount\s*=\s*ledgerPath/);
});
