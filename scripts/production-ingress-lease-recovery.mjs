import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { PRODUCTION_INGRESS_TARGET } from '../src/operations/production-ingress-publication.mjs';
import {
  PRODUCTION_INGRESS_LEASE_RECOVERY_CONFIRMATION,
  recoverProductionIngressPublicationLease
} from '../src/operations/production-ingress-publication-runtime.mjs';

const execute = process.argv.includes('--execute');
const now = new Date();
let result;
try {
  result = recoverProductionIngressPublicationLease({
    runtimeDirectory: PRODUCTION_INGRESS_TARGET.runtimeDirectory,
    execute,
    insideWindow: now >= new Date(PRODUCTION_CHANGE_WINDOW.start) && now <= new Date(PRODUCTION_CHANGE_WINDOW.end),
    confirmation: process.env.PRODUCTION_INGRESS_LEASE_RECOVERY_CONFIRMATION,
    checkedAt: now.toISOString()
  });
} catch (error) {
  const failure = /^INGRESS_PUBLICATION_LEASE_[A-Z0-9_]+$/.test(error?.message ?? '')
    ? error.message
    : 'INGRESS_PUBLICATION_LEASE_RECOVERY_FAILED';
  result = { status: 'FAIL_INGRESS_PUBLICATION_LEASE_RECOVERY', failures: [failure], externalMutationPerformed: false, productionGo: false };
}

const output = {
  checkedAt: now.toISOString(),
  target: { runtimeDirectory: PRODUCTION_INGRESS_TARGET.runtimeDirectory },
  confirmationEnvironment: 'PRODUCTION_INGRESS_LEASE_RECOVERY_CONFIRMATION',
  expectedConfirmation: execute ? PRODUCTION_INGRESS_LEASE_RECOVERY_CONFIRMATION : undefined,
  secretValuesReadOrRecorded: false,
  ...result
};
const writer = result.status.startsWith('FAIL_') ? console.error : console.log;
writer(JSON.stringify(output, null, 2));
if (result.status.startsWith('FAIL_')) process.exitCode = 1;
