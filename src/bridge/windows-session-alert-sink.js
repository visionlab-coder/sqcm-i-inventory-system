const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { runProcess } = require('./windows-defender-scanner');

const MESSAGES = {
  MALWARE_INFECTED: 'SQCM-i 보안 경보: 악성코드 의심 파일이 차단되었습니다.',
  MALWARE_UNKNOWN: 'SQCM-i 보안 경보: 파일 검사 결과를 확인할 수 없어 업로드가 차단되었습니다.',
  MALWARE_TIMEOUT: 'SQCM-i 운영 경보: 파일 검사 시간이 초과되어 업로드가 차단되었습니다.'
};

function createWindowsSessionAlertSink(options = {}) {
  const executable = path.resolve(String(options.executable || ''));
  const recipient = String(options.recipient || '').trim();
  const auditFile = path.resolve(String(options.auditFile || ''));
  const timeoutMs = Number(options.timeoutMs || 10_000);
  const runner = options.runner || runProcess;
  if (!executable || !recipient || !auditFile) throw new Error('Alert executable, recipient and auditFile are required.');

  async function healthCheck() {
    return { status: 'ok', driver: 'WINDOWS_SESSION_MESSAGE', channel: 'interactive-user-session', recipientConfigured: true };
  }

  async function send(input = {}) {
    const category = String(input.category || '').toUpperCase();
    const message = MESSAGES[category];
    if (!message) throw new Error('Unsupported alert category.');
    const receiptId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const result = await runner(executable, [recipient, '/TIME:60', message], { timeoutMs });
    const delivered = result.code === 0 && result.timedOut !== true;
    const record = { receiptId, createdAt, category, severity: category === 'MALWARE_INFECTED' ? 'HIGH' : 'MEDIUM', channel: 'interactive-user-session', delivered };
    await fs.mkdir(path.dirname(auditFile), { recursive: true });
    await fs.appendFile(auditFile, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
    if (!delivered) throw Object.assign(new Error('Windows session alert delivery failed.'), { receiptId });
    return record;
  }

  return { driver: 'WINDOWS_SESSION_MESSAGE', send, healthCheck };
}

module.exports = { createWindowsSessionAlertSink, MESSAGES };
