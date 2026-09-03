const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

function runProcess(executable, args, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-16_384); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16_384); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }); });
  });
}

async function getDefenderStatus({ powershellExecutable, runner = runProcess, timeoutMs = 10_000 }) {
  const command = 'Get-MpComputerStatus | Select-Object AMProductVersion,AntivirusSignatureVersion,AntivirusSignatureLastUpdated,AntivirusEnabled,RealTimeProtectionEnabled | ConvertTo-Json -Compress';
  const result = await runner(powershellExecutable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { timeoutMs });
  if (result.timedOut || result.code !== 0) throw new Error('Microsoft Defender status is unavailable.');
  const status = JSON.parse(result.stdout);
  if (status.AntivirusEnabled !== true || status.RealTimeProtectionEnabled !== true) throw new Error('Microsoft Defender protection is not enabled.');
  return {
    status: 'ok',
    engine: 'Microsoft Defender Antivirus',
    engineVersion: String(status.AMProductVersion || ''),
    signatureVersion: String(status.AntivirusSignatureVersion || ''),
    signatureUpdatedAt: status.AntivirusSignatureLastUpdated || null
  };
}

function createWindowsDefenderScanner(options = {}) {
  const executable = path.resolve(String(options.executable || ''));
  const powershellExecutable = path.resolve(String(options.powershellExecutable || ''));
  const scanRoot = path.resolve(String(options.scanRoot || ''));
  const timeoutMs = Number(options.timeoutMs || 30_000);
  const runner = options.runner || runProcess;
  const statusProvider = options.statusProvider || (() => getDefenderStatus({ powershellExecutable, runner }));
  if (!executable || !powershellExecutable || !scanRoot) throw new Error('Defender executable, PowerShell executable and scanRoot are required.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) throw new Error('Defender timeoutMs must be 1000..120000.');

  async function healthCheck() {
    const status = await statusProvider();
    return { ...status, driver: 'MICROSOFT_DEFENDER' };
  }

  async function scan(content, metadata = {}) {
    if (!Buffer.isBuffer(content) || content.length < 1) throw new Error('Defender scan content is required.');
    await fs.mkdir(scanRoot, { recursive: true });
    const extension = ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' })[String(metadata.contentType || '').toLowerCase()] || 'bin';
    const target = path.join(scanRoot, `${crypto.randomUUID()}.${extension}`);
    let result;
    try {
      await fs.writeFile(target, content, { flag: 'wx', mode: 0o600 });
      result = await runner(executable, ['-Scan', '-ScanType', '3', '-File', target, '-DisableRemediation'], { timeoutMs });
    } catch (error) {
      result = { code: null, timedOut: false, error: error.message };
    } finally {
      await fs.rm(target, { force: true }).catch(() => {});
    }
    const health = await healthCheck().catch(() => ({ engine: 'Microsoft Defender Antivirus', engineVersion: null, signatureVersion: null }));
    const status = result?.timedOut ? 'timeout' : result?.code === 0 ? 'clean' : result?.code === 2 ? 'infected' : 'unknown';
    return {
      status,
      engine: health.engine,
      engineVersion: health.engineVersion,
      signatureVersion: health.signatureVersion
    };
  }

  return { driver: 'MICROSOFT_DEFENDER', scan, healthCheck };
}

module.exports = { createWindowsDefenderScanner, getDefenderStatus, runProcess };
