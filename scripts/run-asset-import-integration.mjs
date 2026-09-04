import { spawn } from 'node:child_process';
import process from 'node:process';
import 'dotenv/config';

const port = 59213;
const baseUrl = `http://127.0.0.1:${port}`;
const required = ['DATABASE_URL', 'SESSION_SECRET', 'SEED_ADMIN_PASSWORD', 'SEED_MANAGER_PASSWORD', 'SEED_USER_PASSWORD'];
if (required.some(key => !process.env[key])) throw new Error('Local integration environment is incomplete.');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Timed out: ${command}`));
    }, options.timeoutMs || 120_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with code ${code ?? 'null'} and signal ${signal || 'none'}.`));
    });
  });
}

function sanitizeDiagnostic(value) {
  let result = String(value || '').slice(-4_096);
  result = result.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]');
  for (const key of required) if (process.env[key]) result = result.replaceAll(process.env[key], `[REDACTED_${key}]`);
  return result;
}

async function waitForBackend(child, diagnostic) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (child.exitCode != null) throw new Error(`Temporary backend exited before readiness (code ${child.exitCode}): ${sanitizeDiagnostic(diagnostic())}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1_500) });
      if (response.status === 200) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Temporary backend did not become ready.');
}

const childEnv = {
  ...process.env,
  PORT: String(port),
  NODE_ENV: 'development',
  DB_AUTO_MIGRATE: 'false',
  DB_RUN_SEEDS: 'false'
};
const backend = spawn(process.execPath, ['src/server.js'], { cwd: process.cwd(), env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let backendDiagnostic = '';
for (const stream of [backend.stdout, backend.stderr]) stream.on('data', chunk => { backendDiagnostic = `${backendDiagnostic}${chunk}`.slice(-8_192); });

try {
  await waitForBackend(backend, () => backendDiagnostic);
  console.log(JSON.stringify({ event: 'temporary_backend_ready', pid: backend.pid, port }));
  await run(process.execPath, ['--test', '--test-name-pattern=Excel CSV 대량등록', 'test/integration/http-smoke.test.js'], {
    cwd: process.cwd(),
    env: { ...process.env, INTEGRATION_BASE_URL: baseUrl, INTEGRATION_DATABASE_URL: process.env.DATABASE_URL },
    windowsHide: true,
    stdio: 'inherit',
    timeoutMs: 120_000
  });
  console.log(JSON.stringify({ status: 'PASS', temporaryBackendStopped: true }));
} finally {
  if (backend.exitCode == null) {
    backend.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => backend.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 5_000))
    ]);
  }
}
