import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import gates from '../src/operations/gates.js';
import {
  consumeBoundedResponseBody,
  readBoundedJsonObjectResponse
} from '../src/operations/operations-preflight-http-runtime.mjs';

const manifestPath = process.argv[2];
const allowTemplate = process.argv.includes('--allow-template');
const allowCandidate = process.argv.includes('--allow-candidate');
const probe = process.argv.includes('--probe');
if (!manifestPath) {
  console.error('Usage: npm run operations:preflight -- <manifest.json> [--allow-template]');
  process.exit(1);
}

const resolved = path.resolve(manifestPath);
const manifest = JSON.parse(fs.readFileSync(resolved, 'utf8'));
const result = gates.validateOperationsManifest(manifest);
if (manifest.template === true && !allowTemplate) result.failures.push('template manifest cannot authorize deployment');
if (manifest.template !== true && manifest.activationState !== 'active' && !allowCandidate) result.failures.push('non-template manifest activationState must be active');
result.ok = result.failures.length === 0;

if (!result.ok) {
  console.error('Operational preflight failed:');
  result.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

async function expectReachable(url, label, accepted = (status) => status >= 200 && status < 500) {
  const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10000) });
  if (!accepted(response.status)) throw new Error(`${label} returned ${response.status}`);
  return response.status;
}

async function expectGet(url, label) {
  const response = await fetch(url, { method: 'GET', redirect: 'manual', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (response.status !== 200) throw new Error(`${label} returned ${response.status}`);
  await consumeBoundedResponseBody(response);
  return response.status;
}

async function expectStatus(url, label, expectedStatus) {
  const response = await fetch(url, { method: 'GET', redirect: 'manual', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (response.status !== expectedStatus) throw new Error(`${label} returned ${response.status}; expected ${expectedStatus}`);
  await consumeBoundedResponseBody(response);
  return response.status;
}

if (probe) {
  if (manifest.template === true) {
    console.error('Template manifests cannot perform live provider probes.');
    process.exit(1);
  }
  const issuer = manifest.providers.oidc.issuer.replace(/\/$/, '');
  const discoveryResponse = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000) });
  if (!discoveryResponse.ok) throw new Error(`OIDC discovery returned ${discoveryResponse.status}`);
  const discovery = await readBoundedJsonObjectResponse(discoveryResponse);
  if (discovery.issuer !== manifest.providers.oidc.issuer || !/^https:\/\//.test(discovery.authorization_endpoint || '') || !/^https:\/\//.test(discovery.token_endpoint || '')) {
    throw new Error('OIDC discovery contract mismatch');
  }
  const base = manifest.publicBaseUrl.replace(/\/$/, '');
  const ai = manifest.providers.ai;
  const [health, readiness, storage, scanner, eventPublisher, alerting, aiHealth, aiReady] = await Promise.all([
    expectReachable(`${base}/health`, 'frontend health', (status) => status === 200),
    expectReachable(`${base}/api/readiness`, 'backend readiness', (status) => status === 200),
    expectReachable(manifest.providers.storage.endpoint, 'object storage'),
    expectReachable(manifest.providers.malwareScanner.endpoint, 'malware scanner'),
    expectReachable(manifest.providers.eventPublisher.endpoint, 'event publisher'),
    expectReachable(manifest.providers.alerting.endpoint, 'alerting'),
    expectGet(ai.healthEndpoint, 'AI provider health'),
    expectStatus(ai.readyEndpoint, 'AI provider readiness authentication boundary', 401)
  ]);
  console.log(JSON.stringify({ liveProbe: { oidcDiscovery: discoveryResponse.status, health, readiness, storage, scanner, eventPublisher, alerting, aiHealth, aiReady } }, null, 2));
}

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), manifest: resolved, ...result.summary }, null, 2));
console.log(manifest.template ? 'Template contract is valid; external provider evidence is still required.' : `Operational preflight passed${probe ? ' with live probes' : ''}.`);
