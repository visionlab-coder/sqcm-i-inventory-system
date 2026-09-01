import { spawnSync } from 'node:child_process';

const target = 'http://127.0.0.1:3300';
const result = spawnSync(process.execPath, ['scripts/nonfunctional-check.mjs'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  windowsHide: true,
  env: {
    ...process.env,
    NONFUNCTIONAL_BASE_URL: target,
    ALLOW_REMOTE_NONFUNCTIONAL_TEST: 'false',
    LOAD_REQUESTS: '60',
    LOAD_CONCURRENCY: '6',
    MAX_P95_MS: '1000',
    MAX_ERROR_RATE: '0'
  }
});

process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.status !== 0) {
  console.error(JSON.stringify({ status: 'FAIL_PRODUCTION_NONFUNCTIONAL_BASELINE', target, productionGo: false }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: 'PASS_LOOPBACK_BASELINE_READY_FOR_PUBLIC_RECHECK',
    target,
    requests: 60,
    concurrency: 6,
    actualPublicNonfunctionalGate: 'NOT_RUN',
    productionGo: false
  }, null, 2));
}
