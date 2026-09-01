import { spawnSync } from 'node:child_process';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { selectProductionNonfunctionalTarget } from '../src/operations/production-nonfunctional-target.mjs';

const selection = selectProductionNonfunctionalTarget({
  publicMode: process.argv.includes('--public'),
  now: new Date(),
  windowStart: new Date(PRODUCTION_CHANGE_WINDOW.start),
  windowEnd: new Date(PRODUCTION_CHANGE_WINDOW.end),
  confirmation: process.env.PRODUCTION_PUBLIC_NONFUNCTIONAL_CONFIRMATION
});
if (selection.status.startsWith('FAIL_')) {
  console.error(JSON.stringify({ ...selection, productionGo: false }, null, 2));
  process.exit(1);
}
if (!selection.target) {
  console.log(JSON.stringify({ ...selection, productionGo: false }, null, 2));
  process.exit(0);
}

const target = selection.target;
const result = spawnSync(process.execPath, ['scripts/nonfunctional-check.mjs'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  windowsHide: true,
  env: {
    ...process.env,
    NONFUNCTIONAL_BASE_URL: target,
    ALLOW_REMOTE_NONFUNCTIONAL_TEST: String(selection.allowRemote),
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
    status: selection.actualPublicGate
      ? 'PASS_ACTUAL_PUBLIC_NONFUNCTIONAL_GATE'
      : 'PASS_LOOPBACK_BASELINE_READY_FOR_PUBLIC_RECHECK',
    target,
    requests: 60,
    concurrency: 6,
    actualPublicNonfunctionalGate: selection.actualPublicGate ? 'PASS' : 'NOT_RUN',
    productionGo: false
  }, null, 2));
}
