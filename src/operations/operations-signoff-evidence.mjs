import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const OPERATIONS_SIGNOFF_EVIDENCE_CONFIRMATION = 'ACK-COMPILE-P7-PRODUCTION-OPERATIONS-SIGNOFF-EVIDENCE';
export const OPERATIONS_SIGNOFF_TARGET_URL = 'https://inventory.safe-link.co.kr';
export const OPERATIONS_SIGNOFF_DOMAINS = ['slo', 'alerting', 'backup', 'restore', 'certificate', 'onCall', 'maintenance', 'improvementQueue'];
export const OPERATIONS_SIGNOFF_DUTIES = ['on_call', 'alert_response', 'backup_restore', 'certificate_renewal', 'daily_maintenance', 'improvement_triage'];

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const RECEIPT_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function evaluateOperationsSignoffEvidenceCompiler({
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
  if (!p6EvidenceComplete) return { status: 'READY_WAIT_P6_COMPLETION_AND_OPERATIONS_SIGNOFF', missing, evidenceCreated: false };
  if (!p7InProgress) return { status: 'READY_WAIT_P7_ACTIVATION', missing, evidenceCreated: false };
  if (missing.length > 0) return { status: 'READY_WAIT_OPERATIONS_SIGNOFF_EXPORT_AND_OUTPUT', missing, evidenceCreated: false };
  if (!execute) return { status: 'PASS_OPERATIONS_SIGNOFF_EVIDENCE_COMPILER_DRY_RUN_READY', missing, evidenceCreated: false };
  if (!confirmed) return { status: 'READY_WAIT_OPERATIONS_SIGNOFF_EVIDENCE_CONFIRMATION', missing, evidenceCreated: false };
  return { status: 'READY_OPERATIONS_SIGNOFF_EVIDENCE_COMPILATION', missing, evidenceCreated: false };
}

export function compileOperationsSignoffEvidence(source, { checkedAt = new Date().toISOString(), sourceSha256 } = {}) {
  const failures = [];
  if (!source || typeof source !== 'object' || Array.isArray(source)) failures.push('source must be an object');
  if (source?.schemaVersion !== 1) failures.push('source schemaVersion must be 1');
  if (source?.template !== false) failures.push('source template must be false');
  if (source?.environment !== 'production') failures.push('source environment must be production');
  if (source?.activationState !== 'actual') failures.push('source activationState must be actual');
  if (source?.evidenceType !== 'PRODUCTION_OPERATIONS_SIGNOFF_EXPORT') failures.push('source evidenceType mismatch');
  if (source?.targetUrl !== OPERATIONS_SIGNOFF_TARGET_URL) failures.push('source targetUrl must match Production');
  if (!validDate(checkedAt)) failures.push('checkedAt is required');
  if (!SHA256_PATTERN.test(sourceSha256 ?? '')) failures.push('source sha256 is required');
  if (!RELEASE_SHA_PATTERN.test(source?.releaseSha ?? '')) failures.push('releaseSha must be an immutable 40-hex SHA');
  if (!SHA256_PATTERN.test(source?.p6CutoverEvidenceSha256 ?? '')) failures.push('p6CutoverEvidenceSha256 is required');

  const signoff = source?.signoff ?? {};
  if (signoff.decision !== 'APPROVED') failures.push('signoff decision must be APPROVED');
  if (signoff.role !== 'OPERATIONS_OWNER') failures.push('signoff role must be OPERATIONS_OWNER');
  if (!IDENTITY_PATTERN.test(signoff.signedByRef ?? '')) failures.push('signedByRef must be an identity reference');
  if (!validDate(signoff.signedAt)) failures.push('signedAt is required');
  if (!RECEIPT_PATTERN.test(signoff.receiptId ?? '')) failures.push('signoff receiptId is invalid');
  if (signoff.blockingExceptionCount !== 0) failures.push('blockingExceptionCount must be zero');

  const checkedMs = Date.parse(checkedAt);
  const signedMs = Date.parse(signoff.signedAt);
  if (validDate(checkedAt) && validDate(signoff.signedAt)
    && (signedMs > checkedMs || checkedMs - signedMs > 24 * 60 * 60000)) failures.push('signoff must be within the last 24 hours and not in the future');

  const attestations = Array.isArray(signoff.attestations) ? signoff.attestations : [];
  if (JSON.stringify(attestations.map((item) => item?.domain)) !== JSON.stringify(OPERATIONS_SIGNOFF_DOMAINS)) failures.push('attestations must contain eight ordered operations domains');
  if (!attestations.every((item) => item?.status === 'PASS')) failures.push('all operations attestations must be PASS');
  if (!attestations.every((item) => SHA256_PATTERN.test(item?.evidenceSha256 ?? ''))) failures.push('all operations attestations require evidenceSha256');
  const attestationHashes = attestations.map((item) => item?.evidenceSha256).filter((value) => SHA256_PATTERN.test(value ?? ''));
  if (new Set(attestationHashes).size !== attestationHashes.length) failures.push('operations attestation evidenceSha256 values must be unique');

  if (JSON.stringify(signoff.acceptedDuties) !== JSON.stringify(OPERATIONS_SIGNOFF_DUTIES)) failures.push('acceptedDuties must match the complete ordered operations duty set');

  if (failures.length > 0) return { status: 'BLOCKED_OPERATIONS_SIGNOFF_EVIDENCE_INVALID', failures, evidence: null };
  return {
    status: 'PASS_OPERATIONS_SIGNOFF_EVIDENCE_COMPILED',
    failures,
    evidence: {
      schemaVersion: 1,
      environment: 'production',
      activationState: 'actual',
      evidenceType: 'P7_OPERATIONS_SIGNOFF_ACTUAL',
      domain: 'operations-signoff',
      status: 'APPROVED',
      checkedAt,
      signedByRef: signoff.signedByRef,
      signedAt: signoff.signedAt,
      provenance: {
        targetUrl: OPERATIONS_SIGNOFF_TARGET_URL,
        releaseSha: source.releaseSha,
        sourceSha256,
        p6CutoverEvidenceSha256: source.p6CutoverEvidenceSha256,
        receiptId: signoff.receiptId,
        role: signoff.role,
        blockingExceptionCount: 0,
        attestations: attestations.map((item) => ({ domain: item.domain, status: item.status, evidenceSha256: item.evidenceSha256 })),
        acceptedDuties: [...signoff.acceptedDuties]
      }
    }
  };
}

export function sha256OperationsSignoffBuffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function writeOperationsSignoffEvidenceOnce(outputPath, evidence, { processId = process.pid } = {}) {
  if (!outputPath || !fs.existsSync(path.dirname(outputPath))) throw new Error('OUTPUT_DIRECTORY_MISSING');
  if (fs.existsSync(outputPath)) throw new Error('OUTPUT_ALREADY_EXISTS');
  const temporaryPath = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${processId}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporaryPath, outputPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
    throw error;
  }
  return outputPath;
}
