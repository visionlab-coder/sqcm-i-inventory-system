import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCertificateObservation,
  CERTIFICATE_OBSERVATION_CONFIRMATION,
  CERTIFICATE_OBSERVATION_HOSTNAME,
  CERTIFICATE_OBSERVATION_TARGET_URL,
  evaluateOperationsCertificateObserverGate,
  writeCertificateObservationOnce
} from '../src/operations/operations-certificate-observer.mjs';
import { readOperationsRoadmapControl } from '../src/operations/operations-roadmap-control-reader.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = readOperationsRoadmapControl(projectRoot).value;
const p6 = roadmap.phases.find((phase) => phase.id === 'P6');
const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const outputPath = process.env.P7_CERTIFICATE_OBSERVATION_INPUT_FILE
  ? path.resolve(process.env.P7_CERTIFICATE_OBSERVATION_INPUT_FILE)
  : null;
const renewalOwnerRef = process.env.P7_CERTIFICATE_RENEWAL_OWNER_REF ?? null;
const certificateProviderRef = process.env.P7_CERTIFICATE_PROVIDER_REF ?? null;

function physicalExternalTarget(candidate) {
  if (!candidate || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try {
    const parent = path.dirname(candidate);
    const stat = fs.lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)) return false;
    if (path.resolve(fs.realpathSync(parent)).toLowerCase() !== path.resolve(parent).toLowerCase()) return false;
    if (fs.existsSync(candidate)) return false;
    return true;
  } catch {
    return false;
  }
}

function requestProductionPath(route) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: 'https:',
      hostname: CERTIFICATE_OBSERVATION_HOSTNAME,
      servername: CERTIFICATE_OBSERVATION_HOSTNAME,
      port: 443,
      path: route,
      method: 'GET',
      rejectUnauthorized: true,
      timeout: 10000,
      headers: { Accept: 'application/json' }
    }, (response) => {
      const socket = response.socket;
      const certificate = socket.getPeerCertificate();
      const result = {
        status: response.statusCode,
        authorized: socket.authorized === true,
        protocol: socket.getProtocol(),
        serialNumber: certificate.serialNumber,
        fingerprint256: certificate.fingerprint256,
        validFrom: certificate.valid_from,
        validTo: certificate.valid_to
      };
      response.resume();
      response.once('end', () => resolve(result));
    });
    request.once('timeout', () => request.destroy(new Error('TLS_OBSERVATION_TIMEOUT')));
    request.once('error', reject);
    request.end();
  });
}

const gate = evaluateOperationsCertificateObserverGate({
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7InProgress: p7?.status === 'in-progress',
  productionGo: roadmap.invariants?.productionGo === true,
  outputPresent: Boolean(outputPath),
  renewalOwnerRef,
  certificateProviderRef,
  execute: process.argv.includes('--observe'),
  confirmed: process.env.P7_CERTIFICATE_OBSERVATION_CONFIRMATION === CERTIFICATE_OBSERVATION_CONFIRMATION
});

let status = gate.status;
let observationCreated = false;
let failureCount = 0;
let externalHttpReadPerformed = false;

if (gate.externalHttpReadAllowed) {
  try {
    if (!physicalExternalTarget(outputPath)) throw new Error('OUTPUT_MUST_BE_NEW_EXTERNAL_PHYSICAL_FILE');
    externalHttpReadPerformed = true;
    const observedAt = new Date().toISOString();
    const [health, readiness] = await Promise.all([
      requestProductionPath('/health'),
      requestProductionPath('/api/readiness')
    ]);
    const peerConsistent = ['protocol', 'serialNumber', 'fingerprint256', 'validFrom', 'validTo']
      .every((field) => health[field] === readiness[field]);
    const observation = buildCertificateObservation({
      hostname: CERTIFICATE_OBSERVATION_HOSTNAME,
      targetUrl: CERTIFICATE_OBSERVATION_TARGET_URL,
      observedAt,
      authorized: health.authorized && readiness.authorized,
      peerConsistent,
      protocol: health.protocol,
      serialNumber: health.serialNumber,
      fingerprint256: health.fingerprint256,
      validFrom: health.validFrom,
      validTo: health.validTo,
      healthStatus: health.status,
      readinessStatus: readiness.status,
      renewalOwnerRef,
      certificateProviderRef
    });
    writeCertificateObservationOnce(outputPath, observation);
    status = 'PASS_PRODUCTION_TLS_CERTIFICATE_OBSERVATION_CREATED';
    observationCreated = true;
  } catch {
    status = 'BLOCKED_PRODUCTION_TLS_CERTIFICATE_OBSERVATION';
    failureCount = 1;
    process.exitCode = 1;
  }
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  status,
  requiredOutputEnvironment: 'P7_CERTIFICATE_OBSERVATION_INPUT_FILE',
  renewalOwnerEnvironment: 'P7_CERTIFICATE_RENEWAL_OWNER_REF',
  providerEnvironment: 'P7_CERTIFICATE_PROVIDER_REF',
  confirmationEnvironment: 'P7_CERTIFICATE_OBSERVATION_CONFIRMATION',
  requiredTargetUrl: CERTIFICATE_OBSERVATION_TARGET_URL,
  missing: gate.missing,
  observationCreated,
  failureCount,
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7Status: p7?.status ?? null,
  externalHttpReadPerformed,
  localEvidenceWritePerformed: observationCreated,
  externalMutationPerformed: false,
  secretValuesReadOrRecorded: false,
  productionGo: roadmap.invariants?.productionGo === true
}, null, 2));
