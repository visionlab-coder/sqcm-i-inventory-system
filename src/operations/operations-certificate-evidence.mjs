import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeCreateOnlyJsonOutput } from './operations-create-only-json-output.mjs';

export const CERTIFICATE_EVIDENCE_CONFIRMATION = 'ACK-COMPILE-P7-PRODUCTION-CERTIFICATE-EVIDENCE';
export const CERTIFICATE_TARGET_URL = 'https://inventory.safe-link.co.kr';
export const CERTIFICATE_HOSTNAME = 'inventory.safe-link.co.kr';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const PROVIDER_PATTERN = /^provider:\/\/[A-Za-z0-9._/@:-]+$/;
const SERIAL_PATTERN = /^[A-Fa-f0-9:-]{8,200}$/;
const ALLOWED_PROTOCOLS = new Set(['TLSv1.2', 'TLSv1.3']);

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function evaluateOperationsCertificateEvidenceCompiler({
  p6EvidenceComplete = false,
  p7InProgress = false,
  inputPresent = false,
  outputPresent = false,
  execute = false,
  confirmed = false
} = {}) {
  const missing = [];
  if (!inputPresent) missing.push('input');
  if (!outputPresent) missing.push('output');
  if (!p6EvidenceComplete) return { status: 'READY_WAIT_P6_COMPLETION_AND_CERTIFICATE_OBSERVATION', missing, evidenceCreated: false };
  if (!p7InProgress) return { status: 'READY_WAIT_P7_ACTIVATION', missing, evidenceCreated: false };
  if (missing.length > 0) return { status: 'READY_WAIT_CERTIFICATE_OBSERVATION_AND_OUTPUT', missing, evidenceCreated: false };
  if (!execute) return { status: 'PASS_CERTIFICATE_EVIDENCE_COMPILER_DRY_RUN_READY', missing, evidenceCreated: false };
  if (!confirmed) return { status: 'READY_WAIT_CERTIFICATE_EVIDENCE_CONFIRMATION', missing, evidenceCreated: false };
  return { status: 'READY_CERTIFICATE_EVIDENCE_COMPILATION', missing, evidenceCreated: false };
}

export function compileOperationsCertificateEvidence(source, { checkedAt = new Date().toISOString(), sourceSha256 } = {}) {
  const failures = [];
  if (!source || typeof source !== 'object' || Array.isArray(source)) failures.push('source must be an object');
  if (source?.schemaVersion !== 1) failures.push('source schemaVersion must be 1');
  if (source?.template !== false) failures.push('source template must be false');
  if (source?.environment !== 'production') failures.push('source environment must be production');
  if (source?.activationState !== 'actual') failures.push('source activationState must be actual');
  if (source?.evidenceType !== 'PRODUCTION_TLS_CERTIFICATE_OBSERVATION') failures.push('source evidenceType mismatch');
  if (source?.targetUrl !== CERTIFICATE_TARGET_URL) failures.push('source targetUrl must match Production');
  if (source?.hostname !== CERTIFICATE_HOSTNAME) failures.push('source hostname must match Production');
  if (!IDENTITY_PATTERN.test(source?.renewalOwnerRef ?? '')) failures.push('renewalOwnerRef is required');
  if (!PROVIDER_PATTERN.test(source?.certificateProviderRef ?? '')) failures.push('certificateProviderRef is required');
  if (!validDate(checkedAt)) failures.push('checkedAt is required');
  if (!SHA256_PATTERN.test(sourceSha256 ?? '')) failures.push('source sha256 is required');

  const observation = source?.observation ?? {};
  if (!validDate(observation.observedAt)) failures.push('observedAt is required');
  if (observation.tlsValid !== true) failures.push('TLS must be valid');
  if (observation.hostnameVerified !== true) failures.push('hostname must be verified');
  if (observation.chainVerified !== true) failures.push('certificate chain must be verified');
  if (!ALLOWED_PROTOCOLS.has(observation.protocol)) failures.push('TLS protocol must be TLSv1.2 or TLSv1.3');
  if (!SERIAL_PATTERN.test(observation.serialNumber ?? '')) failures.push('certificate serialNumber is invalid');
  if (!SHA256_PATTERN.test(observation.fingerprintSha256 ?? '')) failures.push('certificate fingerprint sha256 is required');
  if (!validDate(observation.validFrom) || !validDate(observation.validTo)) failures.push('certificate validity timestamps are required');
  if (observation.healthStatus !== 200 || observation.readinessStatus !== 200) failures.push('Production health and readiness must both be 200');

  const checkedMs = Date.parse(checkedAt);
  const observedMs = Date.parse(observation.observedAt);
  const validFromMs = Date.parse(observation.validFrom);
  const validToMs = Date.parse(observation.validTo);
  const observationAgeMinutes = Math.round((checkedMs - observedMs) / 60000);
  const daysRemaining = Math.floor((validToMs - observedMs) / 86400000);
  if (validDate(checkedAt) && validDate(observation.observedAt) && (observationAgeMinutes < 0 || observationAgeMinutes > 60)) failures.push('certificate observation must be within 60 minutes');
  if (validDate(observation.observedAt) && validDate(observation.validFrom) && observedMs < validFromMs) failures.push('certificate must already be valid at observation');
  if (validDate(observation.observedAt) && validDate(observation.validTo) && observedMs >= validToMs) failures.push('certificate must not be expired at observation');
  if (validDate(observation.observedAt) && validDate(observation.validTo) && daysRemaining < 30) failures.push('certificate must have at least 30 full days remaining');

  if (failures.length > 0) return { status: 'BLOCKED_CERTIFICATE_EVIDENCE_INVALID', failures, evidence: null };
  return {
    status: 'PASS_CERTIFICATE_EVIDENCE_COMPILED',
    failures,
    evidence: {
      schemaVersion: 1,
      environment: 'production',
      activationState: 'actual',
      evidenceType: 'P7_OPERATIONS_DOMAIN_ACTUAL',
      domain: 'certificate',
      status: 'PASS',
      checkedAt,
      metrics: {
        hostname: CERTIFICATE_HOSTNAME,
        tlsValid: true,
        daysRemaining
      },
      provenance: {
        targetUrl: CERTIFICATE_TARGET_URL,
        renewalOwnerRef: source.renewalOwnerRef,
        certificateProviderRef: source.certificateProviderRef,
        sourceSha256,
        observedAt: observation.observedAt,
        observationAgeMinutes,
        protocol: observation.protocol,
        serialNumber: observation.serialNumber,
        fingerprintSha256: observation.fingerprintSha256,
        validFrom: observation.validFrom,
        validTo: observation.validTo,
        hostnameVerified: true,
        chainVerified: true,
        healthStatus: 200,
        readinessStatus: 200
      }
    }
  };
}

export function sha256CertificateBuffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function writeOperationsCertificateEvidenceOnce(outputPath, evidence, { processId = process.pid } = {}) {
  return writeCreateOnlyJsonOutput(outputPath, evidence, { processId });
}
