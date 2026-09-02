import crypto from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ONCALL_DRILL_CONFIRMATION,
  buildOnCallHandoverExport,
  evaluateOnCallDrillGate,
  onCallDrillIdempotencyKey,
  validateOnCallDrillProviderManifest,
  writeOnCallHandoverExportOnce
} from '../src/operations/operations-oncall-drill-runner.mjs';
import { compileOperationsOnCallEvidence } from '../src/operations/operations-oncall-evidence.mjs';
import { readOperationsActivationInputDocument, readOperationsSecretInput } from '../src/operations/operations-activation-input-reader.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = JSON.parse(fs.readFileSync(path.join(projectRoot, 'agent docs', 'harness', 'MASTER_ROADMAP.json'), 'utf8'));
const p6 = roadmap.phases.find((phase) => phase.id === 'P6');
const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const manifestPath = process.env.P7_ONCALL_DRILL_PROVIDER_MANIFEST_FILE ? path.resolve(process.env.P7_ONCALL_DRILL_PROVIDER_MANIFEST_FILE) : null;
const credentialPath = process.env.P7_ONCALL_DRILL_API_TOKEN_FILE ? path.resolve(process.env.P7_ONCALL_DRILL_API_TOKEN_FILE) : null;
const outputPath = process.env.P7_ONCALL_HANDOVER_INPUT_FILE ? path.resolve(process.env.P7_ONCALL_HANDOVER_INPUT_FILE) : null;

function externalPhysicalFile(candidate) {
  if (!candidate || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isFile() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false)
      && path.resolve(fs.realpathSync(candidate)).toLowerCase() === path.resolve(candidate).toLowerCase();
  } catch { return false; }
}

function externalNewFile(candidate) {
  if (!candidate || fs.existsSync(candidate) || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try {
    const parent = path.dirname(candidate);
    const stat = fs.lstatSync(parent);
    return stat.isDirectory() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false)
      && path.resolve(fs.realpathSync(parent)).toLowerCase() === path.resolve(parent).toLowerCase();
  } catch { return false; }
}

function publicNetworkAddress(value) {
  const address = String(value).toLowerCase();
  const family = net.isIP(address);
  if (!family) return false;
  if (family === 4) return !/^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|224\.|23[2-9]\.|24[0-9]\.|25[0-5]\.)/.test(address);
  if (address === '::' || address === '::1' || address.startsWith('fc') || address.startsWith('fd') || /^fe[89ab]/.test(address)) return false;
  if (address.startsWith('::ffff:')) return publicNetworkAddress(address.slice(7));
  return true;
}

async function sendRole(manifest, token, role) {
  const ownerRef = role === 'PRIMARY' ? manifest.schedule.primaryOwnerRef : manifest.schedule.escalationOwnerRef;
  const idempotencyKey = onCallDrillIdempotencyKey(manifest.drillId, role);
  const body = JSON.stringify({
    schemaVersion: 1, environment: 'production', test: true, drillId: manifest.drillId, role,
    idempotencyKey, targetUrl: 'https://inventory.safe-link.co.kr', providerRef: manifest.providerRef,
    channelRef: manifest.channelRef, ownerRef
  });
  const raw = await new Promise((resolve, reject) => {
    const request = https.request(manifest.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json',
        'Content-Length': Buffer.byteLength(body), 'Idempotency-Key': idempotencyKey
      },
      lookup(hostname, options, callback) {
        dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
          if (error) return callback(error);
          if (!addresses.length || addresses.some(({ address }) => !publicNetworkAddress(address))) return callback(new Error('ONCALL_PROVIDER_DNS_NOT_PUBLIC'));
          const preferred = addresses.find(({ family }) => family === options?.family) ?? addresses[0];
          if (options?.all) return callback(null, addresses);
          return callback(null, preferred.address, preferred.family);
        });
      }
    }, (response) => {
      let value = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        value += chunk;
        if (value.length > 65536) response.destroy(new Error('ONCALL_DRILL_RESPONSE_TOO_LARGE'));
      });
      response.on('end', () => response.statusCode >= 200 && response.statusCode < 300
        ? resolve(value) : reject(new Error(`ONCALL_DRILL_REQUEST_FAILED_${response.statusCode}`)));
      response.on('error', reject);
    });
    request.setTimeout(15000, () => request.destroy(new Error('ONCALL_DRILL_TIMEOUT')));
    request.on('error', reject);
    request.end(body);
  });
  try { return JSON.parse(raw); } catch { throw new Error('ONCALL_DRILL_RESPONSE_INVALID'); }
}

const gate = evaluateOnCallDrillGate({
  p6EvidenceComplete: p6?.status === 'evidence-complete', p7InProgress: p7?.status === 'in-progress',
  productionGo: roadmap.invariants?.productionGo === true,
  manifestPresent: externalPhysicalFile(manifestPath), credentialReferencePresent: externalPhysicalFile(credentialPath),
  outputConfigured: externalNewFile(outputPath), outputExists: externalPhysicalFile(outputPath),
  execute: process.argv.includes('--send'), confirmed: process.env.P7_ONCALL_DRILL_CONFIRMATION === ONCALL_DRILL_CONFIRMATION
});

let status = gate.status;
let requestCount = 0;
let acknowledgedReceiptCount = 0;
let exportCreated = false;
let secretValueUsed = false;
let failureCount = 0;
let drillIdSha256 = null;

if (gate.externalMessageAllowed) {
  try {
    const manifestInput = readOperationsActivationInputDocument(manifestPath, { repositoryRoot: projectRoot });
    const manifest = validateOnCallDrillProviderManifest(manifestInput.value);
    drillIdSha256 = crypto.createHash('sha256').update(manifest.drillId).digest('hex');
    const token = readOperationsSecretInput(credentialPath, { repositoryRoot: projectRoot }).value;
    secretValueUsed = true;
    if (token.length < 20 || /\s/.test(token)) throw new Error('ONCALL_DRILL_TOKEN_INVALID');
    const results = [];
    for (const role of ['PRIMARY', 'ESCALATION']) {
      requestCount += 1;
      const result = await sendRole(manifest, token, role);
      results.push(result);
      if (result?.acknowledgementStatus === 'ACKNOWLEDGED') acknowledgedReceiptCount += 1;
    }
    const checkedAt = new Date().toISOString();
    const exportValue = buildOnCallHandoverExport({ manifest, acknowledgementResults: results, checkedAt });
    const contract = compileOperationsOnCallEvidence(exportValue, { checkedAt, sourceSha256: '0'.repeat(64) });
    if (!contract.evidence) throw new Error(`ONCALL_HANDOVER_EXPORT_CONTRACT_INVALID_${contract.failures.length}`);
    writeOnCallHandoverExportOnce(outputPath, exportValue);
    exportCreated = true;
    status = 'PASS_PRODUCTION_ONCALL_ESCALATION_DRILL_EXPORT_CREATED';
  } catch {
    status = 'BLOCKED_PRODUCTION_ONCALL_ESCALATION_DRILL';
    failureCount = 1;
    process.exitCode = 1;
  }
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), status,
  requiredManifestEnvironment: 'P7_ONCALL_DRILL_PROVIDER_MANIFEST_FILE',
  requiredCredentialEnvironment: 'P7_ONCALL_DRILL_API_TOKEN_FILE',
  requiredOutputEnvironment: 'P7_ONCALL_HANDOVER_INPUT_FILE',
  confirmationEnvironment: 'P7_ONCALL_DRILL_CONFIRMATION',
  requiredRoles: ['PRIMARY', 'ESCALATION'], missing: gate.missing,
  requestCount, acknowledgedReceiptCount, exportCreated, failureCount, drillIdSha256,
  p6EvidenceComplete: p6?.status === 'evidence-complete', p7Status: p7?.status ?? null,
  externalMessageSent: requestCount > 0, externalMutationPerformed: requestCount > 0,
  localEvidenceWritePerformed: exportCreated, secretValueUsed, secretValuesRecorded: false,
  productionGo: roadmap.invariants?.productionGo === true
}, null, 2));
