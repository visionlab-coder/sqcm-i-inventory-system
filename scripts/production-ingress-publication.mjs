import { existsSync, lstatSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { inspectOperationsSecretInputReference, readOperationsSecretInput } from '../src/operations/operations-activation-input-reader.mjs';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { PRODUCTION_ROUTE_DISABLE_CONFIRMATION } from '../src/operations/production-route-disable.mjs';
import {
  PRODUCTION_INGRESS_CONFIRMATION,
  PRODUCTION_INGRESS_TARGET,
  classifyProductionIngressPublicationResult,
  evaluateProductionIngressPublicationGate
} from '../src/operations/production-ingress-publication.mjs';
import {
  acquireProductionIngressPublicationLease,
  observeProductionIngressDnsResilient,
  observeProductionIngressProcess,
  publishProductionTunnelCredential,
  readProductionIngressConfig,
  releaseProductionIngressPublicationLease,
  requestCloudflareJson,
  runIngressCommand,
  startProductionIngressProcess,
  writeProductionIngressConfigCreateOnly
} from '../src/operations/production-ingress-publication-runtime.mjs';

const CLOUDFLARED = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const ORIGIN_CERT = 'C:\\Users\\user\\.cloudflared\\cert.pem';
const CREDENTIAL_DIRECTORY = 'C:\\Users\\user\\.cloudflared';
const TOKEN_ENV = 'CLOUDFLARE_PRODUCTION_DNS_API_TOKEN_FILE';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const exactFile = (value) => {
  if (!value || !existsSync(value)) return false;
  try { return statSync(value).isFile() && !lstatSync(value).isSymbolicLink(); } catch { return false; }
};
const runCloudflared = (args) => {
  const result = runIngressCommand(CLOUDFLARED, args);
  if (!result.ok) throw new Error(result.failure === 'COMMAND_TIMEOUT' ? 'INGRESS_CLOUDFLARED_TIMEOUT' : 'INGRESS_CLOUDFLARED_FAILED');
  return result.stdout;
};
const listTunnels = () => JSON.parse(runCloudflared(['tunnel', 'list', '--output', 'json']));
const exactTunnels = () => listTunnels().filter((item) => item.name === PRODUCTION_INGRESS_TARGET.tunnelName);
const credentialPath = (id) => path.join(CREDENTIAL_DIRECTORY, `${id}.json`);
const expectedConfig = (id) => `tunnel: ${id}\ncredentials-file: ${credentialPath(id)}\ningress:\n  - hostname: ${PRODUCTION_INGRESS_TARGET.hostname}\n    service: ${PRODUCTION_INGRESS_TARGET.origin}\n    originRequest:\n      connectTimeout: 10s\n  - service: http_status:404\n`;

async function publicDnsPublished() {
  return observeProductionIngressDnsResilient({ hostname: PRODUCTION_INGRESS_TARGET.hostname });
}
async function originHealthy() {
  try {
    const [health, readiness] = await Promise.all(['/health', '/api/readiness'].map((route) => fetch(`${PRODUCTION_INGRESS_TARGET.origin}${route}`, { signal: AbortSignal.timeout(5000) })));
    return health.status === 200 && readiness.status === 200;
  } catch { return false; }
}
async function cloudflare(token, apiPath, options = {}) {
  return requestCloudflareJson({ url: `https://api.cloudflare.com/client/v4${apiPath}`, token, options });
}
function ensureRuntimeDirectory() {
  const target = path.resolve(PRODUCTION_INGRESS_TARGET.runtimeDirectory);
  if (!existsSync(target)) mkdirSync(target, { recursive: false });
  if (realpathSync(target).toLowerCase() !== target.toLowerCase() || lstatSync(target).isSymbolicLink()) throw new Error('Production runtime directory is not an exact physical directory.');
}
function ensureConfig(id) {
  ensureRuntimeDirectory();
  const content = expectedConfig(id);
  if (existsSync(PRODUCTION_INGRESS_TARGET.configPath)) {
    const existing = readProductionIngressConfig({
      runtimeDirectory: PRODUCTION_INGRESS_TARGET.runtimeDirectory,
      configPath: PRODUCTION_INGRESS_TARGET.configPath
    });
    if (existing.text.replace(/\r\n/g, '\n') !== content) throw new Error('Existing Production ingress config does not match the exact contract.');
    return false;
  }
  writeProductionIngressConfigCreateOnly({
    runtimeDirectory: PRODUCTION_INGRESS_TARGET.runtimeDirectory,
    configPath: PRODUCTION_INGRESS_TARGET.configPath,
    content
  });
  return true;
}
async function main() {
const execute = process.argv.includes('--execute');
const now = new Date();
const initialTunnels = exactTunnels();
const initialDnsObservation = await publicDnsPublished();
const initialDnsPublished = initialDnsObservation.published;
const initialTunnelId = initialTunnels[0]?.id || null;
const gate = evaluateProductionIngressPublicationGate({
  ...PRODUCTION_INGRESS_TARGET,
  preserveExistingTunnels: true,
  preserveLoopbackServices: true,
  existingTunnelCount: initialTunnels.length,
  tunnelCredentialPresent: initialTunnelId ? exactFile(credentialPath(initialTunnelId)) : false,
  originCertificatePresent: exactFile(ORIGIN_CERT),
  rollbackTokenReferencePresent: inspectOperationsSecretInputReference(process.env[TOKEN_ENV], { repositoryRoot: projectRoot }).present,
  dnsObservationSucceeded: initialDnsObservation.succeeded,
  unexpectedPublicDns: initialDnsPublished && initialTunnels.length === 0,
  execute,
  insideWindow: now >= new Date(PRODUCTION_CHANGE_WINDOW.start) && now <= new Date(PRODUCTION_CHANGE_WINDOW.end),
  confirmed: process.env.PRODUCTION_INGRESS_CONFIRMATION === PRODUCTION_INGRESS_CONFIRMATION,
  rollbackConfirmed: process.env.PRODUCTION_ROUTE_DISABLE_CONFIRMATION === PRODUCTION_ROUTE_DISABLE_CONFIRMATION
});

if (gate.status !== 'READY_INGRESS_PUBLICATION_EXECUTION') {
  const output = { checkedAt: now.toISOString(), target: PRODUCTION_INGRESS_TARGET, requiredEnvironment: [TOKEN_ENV, 'PRODUCTION_INGRESS_CONFIRMATION', 'PRODUCTION_ROUTE_DISABLE_CONFIRMATION'], secretValuesReadOrRecorded: false, ...gate };
  (gate.status.startsWith('FAIL_') ? console.error : console.log)(JSON.stringify(output, null, 2));
  if (gate.status.startsWith('FAIL_')) process.exitCode = 1;
} else if (!(await originHealthy())) {
  console.error(JSON.stringify({ checkedAt: now.toISOString(), status: 'FAIL_PRODUCTION_LOOPBACK_ORIGIN_NOT_HEALTHY', externalMutationPerformed: false, productionGo: false }, null, 2));
  process.exitCode = 1;
} else {
  let tunnelCreated = false;
  let configCreated = false;
  let processStarted = false;
  let existingProcessId = null;
  let startedProcessId = null;
  let dnsRecordCreated = false;
  let lease = null;
  let leaseReleased = false;
  try {
    ensureRuntimeDirectory();
    lease = acquireProductionIngressPublicationLease({
      runtimeDirectory: PRODUCTION_INGRESS_TARGET.runtimeDirectory
    });
    let tunnelId = initialTunnelId;
    if (!tunnelId) {
      const createOutput = runCloudflared(['tunnel', 'create', '--credentials-file', path.join(CREDENTIAL_DIRECTORY, 'sqcm-i-inventory-production.json.tmp'), '--output', 'json', PRODUCTION_INGRESS_TARGET.tunnelName]);
      tunnelCreated = true;
      const created = JSON.parse(createOutput);
      tunnelId = created.id;
      const temporaryCredential = path.join(CREDENTIAL_DIRECTORY, 'sqcm-i-inventory-production.json.tmp');
      if (!/^[a-f0-9-]{36}$/i.test(tunnelId || '') || !exactFile(temporaryCredential)) throw new Error('Created Production tunnel identity or credential file is invalid.');
      const finalCredential = credentialPath(tunnelId);
      publishProductionTunnelCredential({
        credentialDirectory: CREDENTIAL_DIRECTORY,
        temporaryPath: temporaryCredential,
        finalPath: finalCredential
      });
    }
    if (!exactFile(credentialPath(tunnelId))) throw new Error('Production tunnel credential file is missing.');
    configCreated = ensureConfig(tunnelId);
    runCloudflared(['tunnel', '--config', PRODUCTION_INGRESS_TARGET.configPath, 'ingress', 'validate']);
    let tunnel = exactTunnels()[0];
    if (!tunnel || (tunnel.connections || []).length === 0) {
      const processObservation = observeProductionIngressProcess({
        cloudflared: CLOUDFLARED,
        configPath: PRODUCTION_INGRESS_TARGET.configPath
      });
      existingProcessId = processObservation.processId;
      if (!processObservation.running) {
        const started = await startProductionIngressProcess({
          cloudflared: CLOUDFLARED,
          configPath: PRODUCTION_INGRESS_TARGET.configPath,
          runtimeDirectory: PRODUCTION_INGRESS_TARGET.runtimeDirectory
        });
        startedProcessId = started.processId;
        processStarted = true;
      }
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await delay(2000);
        tunnel = exactTunnels()[0];
        if ((tunnel?.connections || []).length > 0) break;
      }
    }
    const tunnelConnected = (tunnel?.connections || []).length > 0;
    if (!tunnelConnected) throw new Error('Production tunnel did not establish a Cloudflare connection.');

    const token = readOperationsSecretInput(process.env[TOKEN_ENV], { repositoryRoot: projectRoot }).value;
    if (token.length < 20) throw new Error('Cloudflare rollback token reference contract is invalid.');
    const zones = await cloudflare(token, `/zones?name=${encodeURIComponent(PRODUCTION_INGRESS_TARGET.zone)}&status=active&match=all`);
    if (zones.length !== 1) throw new Error('Exactly one active Cloudflare zone is required.');
    const zoneId = zones[0].id;
    const recordsPath = `/zones/${zoneId}/dns_records?name=${encodeURIComponent(PRODUCTION_INGRESS_TARGET.hostname)}&per_page=100`;
    let records = await cloudflare(token, recordsPath);
    const expectedContent = `${tunnelId}.cfargotunnel.com`;
    if (records.length > 1 || (records.length === 1 && (records[0].type !== 'CNAME' || records[0].content !== expectedContent || records[0].proxied !== true))) throw new Error('Existing Production DNS record is not the exact approved proxied tunnel route.');
    if (records.length === 0) {
      await cloudflare(token, `/zones/${zoneId}/dns_records`, { method: 'POST', body: JSON.stringify({ type: 'CNAME', name: PRODUCTION_INGRESS_TARGET.hostname, content: expectedContent, proxied: true, ttl: 1 }) });
      dnsRecordCreated = true;
      records = await cloudflare(token, recordsPath);
    }
    const dnsRecordExact = records.length === 1 && records[0].type === 'CNAME' && records[0].content === expectedContent && records[0].proxied === true;
    const finalDnsObservation = await publicDnsPublished();
    const classification = classifyProductionIngressPublicationResult({ configValid: true, tunnelConnected, dnsRecordExact, publicDnsPublished: finalDnsObservation.succeeded && finalDnsObservation.published });
    leaseReleased = releaseProductionIngressPublicationLease(lease);
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), target: PRODUCTION_INGRESS_TARGET, tunnelId, tunnelCreated, configCreated, processStarted, existingProcessId, startedProcessId, dnsRecordCreated, leaseAcquired: true, leaseReleased, dnsObservationStatus: finalDnsObservation.status, externalMutationPerformed: tunnelCreated || configCreated || processStarted || dnsRecordCreated, preserveExistingTunnels: true, preserveLoopbackServices: true, secretValuesReadOrRecorded: false, ...classification }, null, 2));
    if (classification.failures.length) process.exitCode = 1;
  } catch (error) {
    if (lease && !leaseReleased) {
      try { leaseReleased = releaseProductionIngressPublicationLease(lease); } catch { /* preserve unowned or unstable lease */ }
    }
    const leaseHeld = error?.message === 'INGRESS_PUBLICATION_LEASE_HELD';
    const output = {
      checkedAt: new Date().toISOString(),
      status: leaseHeld ? 'READY_WAIT_INGRESS_PUBLICATION_LEASE' : 'FAIL_INGRESS_PUBLICATION_EXECUTION',
      failure: String(error?.message || 'Unknown ingress publication failure').replace(/[\r\n]/g, ' ').slice(0, 240),
      tunnelCreated, configCreated, processStarted, existingProcessId, startedProcessId, dnsRecordCreated,
      leaseAcquired: lease !== null,
      leaseReleased,
      externalMutationPerformed: tunnelCreated || configCreated || processStarted || dnsRecordCreated,
      secretValuesReadOrRecorded: false,
      productionGo: false
    };
    (leaseHeld ? console.log : console.error)(JSON.stringify(output, null, 2));
    if (!leaseHeld) process.exitCode = 1;
  }
}
}

await main().catch(() => {
  console.error(JSON.stringify({
    checkedAt: new Date().toISOString(),
    status: 'FAIL_INGRESS_PUBLICATION_PREFLIGHT_OBSERVATION',
    externalMutationPerformed: false,
    secretValuesReadOrRecorded: false,
    productionGo: false
  }, null, 2));
  process.exitCode = 1;
});
