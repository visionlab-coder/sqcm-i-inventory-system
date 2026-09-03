import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { selectProductionNonfunctionalTarget } from '../src/operations/production-nonfunctional-target.mjs';
import {
  parseProductionNonfunctionalResult,
  runProductionNonfunctionalProcess
} from '../src/operations/production-nonfunctional-runtime.mjs';

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
try {
  const child = runProductionNonfunctionalProcess({ target, allowRemote: selection.allowRemote });
  const observation = parseProductionNonfunctionalResult(child.stdout, { expectedTarget: target });
  console.log(JSON.stringify({
    status: selection.actualPublicGate
      ? 'PASS_ACTUAL_PUBLIC_NONFUNCTIONAL_GATE'
      : 'PASS_LOOPBACK_BASELINE_READY_FOR_PUBLIC_RECHECK',
    target,
    requests: 60,
    concurrency: 6,
    load: observation.load,
    security: observation.security,
    actualPublicNonfunctionalGate: selection.actualPublicGate ? 'PASS' : 'NOT_RUN',
    productionGo: false
  }, null, 2));
} catch (error) {
  const failureCode = error?.name === 'ProductionNonfunctionalRuntimeError'
    ? error.message
    : 'NONFUNCTIONAL_RUNTIME_FAILED';
  console.error(JSON.stringify({
    status: 'FAIL_PRODUCTION_NONFUNCTIONAL_BASELINE',
    failureCode,
    target,
    productionGo: false
  }));
  process.exitCode = 1;
}
