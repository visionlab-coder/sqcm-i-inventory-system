import { existsSync, lstatSync, statSync } from 'node:fs';
import path from 'node:path';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import {
  PRODUCTION_INGRESS_ORPHAN_RECOVERY_CONFIRMATION,
  PRODUCTION_INGRESS_TARGET,
  evaluateProductionIngressOrphanRecoveryExecution,
  productionIngressTunnelConnected,
  selectProductionIngressTunnel
} from '../src/operations/production-ingress-publication.mjs';
import {
  acquireProductionIngressPublicationLease,
  inspectProductionIngressTemporaryCredential,
  observeProductionIngressDnsResilient,
  observeProductionIngressProcess,
  releaseProductionIngressPublicationLease,
  removeProductionIngressTemporaryCredential,
  runIngressCommand
} from '../src/operations/production-ingress-publication-runtime.mjs';

const CLOUDFLARED = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const CREDENTIAL_DIRECTORY = 'C:\\Users\\user\\.cloudflared';
const TEMPORARY_CREDENTIAL = path.join(CREDENTIAL_DIRECTORY, 'sqcm-i-inventory-production.json.tmp');

function exactFile(candidate) {
  if (!candidate || !existsSync(candidate)) return false;
  try { return statSync(candidate).isFile() && !lstatSync(candidate).isSymbolicLink(); } catch { return false; }
}

function runCloudflared(args) {
  const result = runIngressCommand(CLOUDFLARED, args);
  if (!result.ok) throw new Error(result.failure === 'COMMAND_TIMEOUT' ? 'INGRESS_ORPHAN_RECOVERY_PROVIDER_TIMEOUT' : 'INGRESS_ORPHAN_RECOVERY_PROVIDER_FAILED');
  return result.stdout;
}

function selectedTunnel() {
  return selectProductionIngressTunnel({
    tunnels: JSON.parse(runCloudflared(['tunnel', 'list', '--output', 'json'])),
    expectedName: PRODUCTION_INGRESS_TARGET.tunnelName
  });
}

async function observeState() {
  let tunnel = null;
  let tunnelObservationSucceeded = false;
  try {
    tunnel = selectedTunnel();
    tunnelObservationSucceeded = true;
  } catch { /* fail-closed in evaluator */ }
  const dns = await observeProductionIngressDnsResilient({ hostname: PRODUCTION_INGRESS_TARGET.hostname });
  let process = null;
  try {
    process = observeProductionIngressProcess({ cloudflared: CLOUDFLARED, configPath: PRODUCTION_INGRESS_TARGET.configPath });
  } catch { /* fail-closed in evaluator */ }
  return {
    tunnel,
    input: {
      tunnelObservationSucceeded,
      dnsObservationSucceeded: dns.succeeded === true,
      processObservationSucceeded: process !== null,
      tunnelPresent: tunnel !== null,
      tunnelConnected: productionIngressTunnelConnected(tunnel),
      temporaryCredentialPresent: exactFile(TEMPORARY_CREDENTIAL),
      finalCredentialPresent: tunnel ? exactFile(path.join(CREDENTIAL_DIRECTORY, `${tunnel.id}.json`)) : false,
      configPresent: exactFile(PRODUCTION_INGRESS_TARGET.configPath),
      processRunning: process?.running === true,
      dnsPublished: dns.published === true
    }
  };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const now = new Date();
  const executionInput = {
    execute,
    insideWindow: now >= new Date(PRODUCTION_CHANGE_WINDOW.start) && now <= new Date(PRODUCTION_CHANGE_WINDOW.end),
    confirmation: process.env.PRODUCTION_INGRESS_ORPHAN_RECOVERY_CONFIRMATION
  };
  const initial = await observeState();
  const gate = evaluateProductionIngressOrphanRecoveryExecution({ ...initial.input, ...executionInput });
  if (gate.status !== 'READY_INGRESS_ORPHAN_RECOVERY_EXECUTION') {
    const output = { checkedAt: now.toISOString(), target: PRODUCTION_INGRESS_TARGET, observation: initial.input, confirmationEnvironment: 'PRODUCTION_INGRESS_ORPHAN_RECOVERY_CONFIRMATION', secretValuesReadOrRecorded: false, ...gate };
    (gate.status.startsWith('FAIL_') ? console.error : console.log)(JSON.stringify(output, null, 2));
    if (gate.status.startsWith('FAIL_')) process.exitCode = 1;
    return;
  }

  let lease = null;
  let leaseReleased = false;
  let tunnelDeleted = false;
  let temporaryCredentialRemoved = false;
  try {
    lease = acquireProductionIngressPublicationLease({ runtimeDirectory: PRODUCTION_INGRESS_TARGET.runtimeDirectory });
    const current = await observeState();
    const currentGate = evaluateProductionIngressOrphanRecoveryExecution({ ...current.input, ...executionInput });
    if (currentGate.status !== 'READY_INGRESS_ORPHAN_RECOVERY_EXECUTION'
      || current.tunnel?.id !== initial.tunnel?.id) throw new Error('INGRESS_ORPHAN_RECOVERY_STATE_CHANGED');
    const credentialSnapshot = inspectProductionIngressTemporaryCredential({
      credentialDirectory: CREDENTIAL_DIRECTORY,
      temporaryPath: TEMPORARY_CREDENTIAL
    });
    runCloudflared(['tunnel', 'delete', current.tunnel.id]);
    tunnelDeleted = true;
    if (selectedTunnel() !== null) throw new Error('INGRESS_ORPHAN_RECOVERY_TUNNEL_STILL_PRESENT');
    temporaryCredentialRemoved = removeProductionIngressTemporaryCredential(credentialSnapshot);
    leaseReleased = releaseProductionIngressPublicationLease(lease);
    console.log(JSON.stringify({
      checkedAt: new Date().toISOString(),
      status: 'PASS_INGRESS_ORPHAN_RECOVERED',
      tunnelDeleted,
      temporaryCredentialRemoved,
      leaseAcquired: true,
      leaseReleased,
      secretValuesReadOrRecorded: false,
      externalMutationPerformed: true,
      productionGo: false
    }, null, 2));
  } catch (error) {
    if (lease && !leaseReleased) {
      try { leaseReleased = releaseProductionIngressPublicationLease(lease); } catch { /* preserve unowned or unstable lease */ }
    }
    console.error(JSON.stringify({
      checkedAt: new Date().toISOString(),
      status: 'FAIL_INGRESS_ORPHAN_RECOVERY_EXECUTION',
      failure: /^INGRESS_[A-Z0-9_]+$/.test(error?.message ?? '') ? error.message : 'INGRESS_ORPHAN_RECOVERY_FAILED',
      tunnelDeleted,
      temporaryCredentialRemoved,
      leaseAcquired: lease !== null,
      leaseReleased,
      secretValuesReadOrRecorded: false,
      externalMutationPerformed: tunnelDeleted || temporaryCredentialRemoved,
      productionGo: false
    }, null, 2));
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error(JSON.stringify({ status: 'FAIL_INGRESS_ORPHAN_RECOVERY', secretValuesReadOrRecorded: false, externalMutationPerformed: false, productionGo: false }, null, 2));
  process.exitCode = 1;
});
