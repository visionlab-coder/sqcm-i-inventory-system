const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createWindowsDefenderScanner } = require('../../src/bridge/windows-defender-scanner');
const { createWindowsSessionAlertSink } = require('../../src/bridge/windows-session-alert-sink');
const { createHttpSecurityProvider } = require('../../src/adapters/http-security-provider');

const defenderHealth = async () => ({ status: 'ok', engine: 'Microsoft Defender Antivirus', engineVersion: '4.18.test', signatureVersion: '1.2.3' });

test('Defender scanner는 clean·infected·timeout을 분리하고 임시 파일을 제거한다', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sqcmi-defender-test-'));
  try {
    for (const fixture of [{ code: 0, timedOut: false, status: 'clean' }, { code: 2, timedOut: false, status: 'infected' }, { code: null, timedOut: true, status: 'timeout' }]) {
      const scanner = createWindowsDefenderScanner({ executable: 'C:\\fixed\\MpCmdRun.exe', powershellExecutable: 'C:\\fixed\\powershell.exe', scanRoot: root, timeoutMs: 1000, statusProvider: defenderHealth, runner: async () => fixture });
      assert.equal((await scanner.scan(Buffer.from('fixture'), { contentType: 'application/pdf' })).status, fixture.status);
      assert.deepEqual(await fs.readdir(root), []);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Windows session alert는 제한된 category만 전송하고 receipt audit를 남긴다', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sqcmi-alert-test-'));
  const auditFile = path.join(root, 'alerts.jsonl');
  try {
    const sink = createWindowsSessionAlertSink({ executable: 'C:\\Windows\\System32\\msg.exe', recipient: 'pilot-user', auditFile, runner: async () => ({ code: 0, timedOut: false }) });
    const receipt = await sink.send({ category: 'MALWARE_UNKNOWN', summary: 'ignored secret-bearing text' });
    assert.equal(receipt.delivered, true);
    const record = JSON.parse((await fs.readFile(auditFile, 'utf8')).trim());
    assert.equal(record.receiptId, receipt.receiptId);
    assert.equal(record.category, 'MALWARE_UNKNOWN');
    assert.equal(JSON.stringify(record).includes('ignored'), false);
    await assert.rejects(() => sink.send({ category: 'ARBITRARY' }), /Unsupported/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

test('HTTP security provider는 infected·unknown·timeout을 fail-closed하고 alert receipt를 요구한다', async () => {
  const categories = [];
  let scanMode = 'infected';
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/alerts')) {
      categories.push(JSON.parse(options.body).category);
      return jsonResponse(202, { receiptId: `receipt-${categories.length}`, delivered: true });
    }
    if (url.endsWith('/health')) return jsonResponse(200, { scanner: { status: 'ok', engineVersion: '4.18.test', signatureVersion: '1.2.3' }, alerting: { status: 'ok' } });
    if (scanMode === 'timeout') return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    return jsonResponse(200, { status: scanMode, engine: 'Microsoft Defender Antivirus' });
  };
  const provider = createHttpSecurityProvider({ malwareScannerUrl: 'http://bridge/scan', malwareScannerHealthUrl: 'http://bridge/health', alertingUrl: 'http://bridge/alerts', malwareScannerApiKey: 'key', alertingApiKey: 'key', malwareScannerTimeoutMs: 10 }, fetchImpl);
  assert.equal((await provider.healthCheck()).status, 'ok');
  assert.equal((await provider.scan(Buffer.from('x'))).status, 'infected');
  scanMode = 'unexpected';
  assert.equal((await provider.scan(Buffer.from('x'))).status, 'unknown');
  scanMode = 'timeout';
  assert.equal((await provider.scan(Buffer.from('x'))).status, 'timeout');
  assert.deepEqual(categories, ['MALWARE_INFECTED', 'MALWARE_UNKNOWN', 'MALWARE_TIMEOUT']);
});
