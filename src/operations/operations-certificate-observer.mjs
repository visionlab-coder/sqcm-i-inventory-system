import fs from 'node:fs';
import path from 'node:path';

export const CERTIFICATE_OBSERVATION_CONFIRMATION = 'ACK-OBSERVE-P7-PRODUCTION-TLS-CERTIFICATE';
export const CERTIFICATE_OBSERVATION_HOSTNAME = 'inventory.safe-link.co.kr';
export const CERTIFICATE_OBSERVATION_TARGET_URL = 'https://inventory.safe-link.co.kr';

const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const PROVIDER_PATTERN = /^provider:\/\/[A-Za-z0-9._/@:-]+$/;
const SERIAL_PATTERN = /^[A-Fa-f0-9:-]{8,200}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ALLOWED_PROTOCOLS = new Set(['TLSv1.2', 'TLSv1.3']);

export function evaluateOperationsCertificateObserverGate({
  p6EvidenceComplete = false,
  p7InProgress = false,
  productionGo = false,
  outputPresent = false,
  renewalOwnerRef,
  certificateProviderRef,
  execute = false,
  confirmed = false
} = {}) {
  const waiting = (status, missing = []) => ({
    status,
    missing,
    externalHttpReadAllowed: false,
    localEvidenceWriteAllowed: false
  });
  if (!p6EvidenceComplete) return waiting('READY_WAIT_P6_ACTUAL_CUTOVER');
  if (!p7InProgress) return waiting('READY_WAIT_P7_ACTIVATION');
  if (!productionGo) return waiting('READY_WAIT_PRODUCTION_GO');
  const missing = [];
  if (!outputPresent) missing.push('output');
  if (!IDENTITY_PATTERN.test(renewalOwnerRef ?? '')) missing.push('renewalOwnerRef');
  if (!PROVIDER_PATTERN.test(certificateProviderRef ?? '')) missing.push('certificateProviderRef');
  if (missing.length > 0) return waiting('READY_WAIT_CERTIFICATE_OBSERVATION_INPUTS', missing);
  if (!execute) return waiting('PASS_CERTIFICATE_OBSERVER_DRY_RUN_READY');
  if (!confirmed) return waiting('READY_WAIT_CERTIFICATE_OBSERVATION_CONFIRMATION');
  return {
    status: 'READY_CERTIFICATE_OBSERVATION',
    missing,
    externalHttpReadAllowed: true,
    localEvidenceWriteAllowed: true
  };
}

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function buildCertificateObservation(input) {
  const fingerprintSha256 = String(input?.fingerprint256 ?? '').replaceAll(':', '').toLowerCase();
  const failures = [];
  if (input?.hostname !== CERTIFICATE_OBSERVATION_HOSTNAME) failures.push('hostname');
  if (input?.targetUrl !== CERTIFICATE_OBSERVATION_TARGET_URL) failures.push('targetUrl');
  if (input?.authorized !== true) failures.push('chain');
  if (input?.peerConsistent !== true) failures.push('peerConsistency');
  if (!ALLOWED_PROTOCOLS.has(input?.protocol)) failures.push('protocol');
  if (!SERIAL_PATTERN.test(input?.serialNumber ?? '')) failures.push('serialNumber');
  if (!SHA256_PATTERN.test(fingerprintSha256)) failures.push('fingerprintSha256');
  if (!validDate(input?.observedAt) || !validDate(input?.validFrom) || !validDate(input?.validTo)) failures.push('timestamps');
  if (input?.healthStatus !== 200) failures.push('healthStatus');
  if (input?.readinessStatus !== 200) failures.push('readinessStatus');
  if (!IDENTITY_PATTERN.test(input?.renewalOwnerRef ?? '')) failures.push('renewalOwnerRef');
  if (!PROVIDER_PATTERN.test(input?.certificateProviderRef ?? '')) failures.push('certificateProviderRef');
  if (failures.length > 0) throw new Error(`CERTIFICATE_OBSERVATION_INVALID:${failures.join(',')}`);

  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'actual',
    evidenceType: 'PRODUCTION_TLS_CERTIFICATE_OBSERVATION',
    targetUrl: CERTIFICATE_OBSERVATION_TARGET_URL,
    hostname: CERTIFICATE_OBSERVATION_HOSTNAME,
    renewalOwnerRef: input.renewalOwnerRef,
    certificateProviderRef: input.certificateProviderRef,
    observation: {
      observedAt: new Date(input.observedAt).toISOString(),
      tlsValid: true,
      hostnameVerified: true,
      chainVerified: true,
      protocol: input.protocol,
      serialNumber: input.serialNumber,
      fingerprintSha256,
      validFrom: new Date(input.validFrom).toISOString(),
      validTo: new Date(input.validTo).toISOString(),
      healthStatus: 200,
      readinessStatus: 200
    }
  };
}

export function writeCertificateObservationOnce(outputPath, observation, { processId = process.pid } = {}) {
  const outputDirectory = outputPath ? path.dirname(outputPath) : null;
  if (!outputDirectory || !fs.existsSync(outputDirectory)) throw new Error('OUTPUT_DIRECTORY_MISSING');
  if (fs.existsSync(outputPath)) throw new Error('OUTPUT_ALREADY_EXISTS');
  const temporaryPath = path.join(outputDirectory, `.${path.basename(outputPath)}.${processId}.tmp`);
  try {
    const handle = fs.openSync(temporaryPath, 'wx');
    try {
      fs.writeFileSync(handle, `${JSON.stringify(observation, null, 2)}\n`, 'utf8');
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temporaryPath, outputPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
    throw error;
  }
  return outputPath;
}
