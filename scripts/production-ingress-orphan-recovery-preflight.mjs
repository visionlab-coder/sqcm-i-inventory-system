import { existsSync, lstatSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  PRODUCTION_INGRESS_TARGET,
  evaluateProductionIngressOrphanRecoveryPreflight,
  selectProductionIngressTunnel
} from '../src/operations/production-ingress-publication.mjs';
import {
  observeProductionIngressDnsResilient,
  observeProductionIngressProcess,
  runIngressCommand
} from '../src/operations/production-ingress-publication-runtime.mjs';

const CLOUDFLARED = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const CREDENTIAL_DIRECTORY = 'C:\\Users\\user\\.cloudflared';
const TEMPORARY_CREDENTIAL = path.join(CREDENTIAL_DIRECTORY, 'sqcm-i-inventory-production.json.tmp');

function exactPhysicalFile(candidate) {
  if (!candidate || !existsSync(candidate)) return false;
  try {
    return statSync(candidate).isFile() && !lstatSync(candidate).isSymbolicLink();
  } catch {
    return false;
  }
}

function observeTunnel() {
  const result = runIngressCommand(CLOUDFLARED, ['tunnel', 'list', '--output', 'json']);
  if (!result.ok) return { succeeded: false, tunnel: null };
  try {
    const tunnels = JSON.parse(result.stdout);
    return {
      succeeded: true,
      tunnel: selectProductionIngressTunnel({
        tunnels,
        expectedName: PRODUCTION_INGRESS_TARGET.tunnelName
      })
    };
  } catch {
    return { succeeded: false, tunnel: null };
  }
}

async function main() {
  const tunnelObservation = observeTunnel();
  const dnsObservation = await observeProductionIngressDnsResilient({
    hostname: PRODUCTION_INGRESS_TARGET.hostname
  });
  let processObservation = null;
  try {
    processObservation = observeProductionIngressProcess({
      cloudflared: CLOUDFLARED,
      configPath: PRODUCTION_INGRESS_TARGET.configPath
    });
  } catch {
    processObservation = null;
  }

  const tunnel = tunnelObservation.tunnel;
  const observation = {
    tunnelObservationSucceeded: tunnelObservation.succeeded,
    dnsObservationSucceeded: dnsObservation.succeeded === true,
    tunnelPresent: tunnel !== null,
    temporaryCredentialPresent: exactPhysicalFile(TEMPORARY_CREDENTIAL),
    finalCredentialPresent: tunnel ? exactPhysicalFile(path.join(CREDENTIAL_DIRECTORY, `${tunnel.id}.json`)) : false,
    configPresent: exactPhysicalFile(PRODUCTION_INGRESS_TARGET.configPath),
    processRunning: processObservation?.running === true,
    dnsPublished: dnsObservation.published === true
  };
  const result = evaluateProductionIngressOrphanRecoveryPreflight(observation);
  const output = {
    checkedAt: new Date().toISOString(),
    target: PRODUCTION_INGRESS_TARGET,
    observation,
    secretValuesReadOrRecorded: false,
    ...result
  };
  (result.status.startsWith('FAIL_') ? console.error : console.log)(JSON.stringify(output, null, 2));
  if (result.status.startsWith('FAIL_')) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    checkedAt: new Date().toISOString(),
    status: 'FAIL_INGRESS_ORPHAN_RECOVERY_PREFLIGHT',
    reason: error?.message || 'UNKNOWN_FAILURE',
    secretValuesReadOrRecorded: false,
    externalMutationPerformed: false,
    productionGo: false
  }, null, 2));
  process.exitCode = 1;
});
