import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeCreateOnlyJsonOutput } from './operations-create-only-json-output.mjs';
import {
  OPERATIONS_SIGNOFF_DOMAINS,
  OPERATIONS_SIGNOFF_DUTIES,
  compileOperationsSignoffEvidence
} from './operations-signoff-evidence.mjs';

export const OPERATIONS_SIGNOFF_INPUT_ASSEMBLY_CONFIRMATION = 'ACK-ASSEMBLE-P7-PRODUCTION-OPERATIONS-SIGNOFF-INPUT';
export const OPERATIONS_OWNER_APPROVAL_RECEIPT_TYPE = 'PRODUCTION_OPERATIONS_OWNER_APPROVAL_RECEIPT';

const TARGET_URL = 'https://inventory.safe-link.co.kr';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const RECEIPT_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

function waiting(status, missing = []) {
  return { status, missing, inputReadAllowed: false, localEvidenceWriteAllowed: false, externalSignatureAllowed: false };
}

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function evaluateOperationsSignoffInputAssemblyGate({
  p6EvidenceComplete = false,
  p7InProgress = false,
  productionGo = false,
  p6EvidencePresent = false,
  domainEvidencePresent = {},
  approvalReceiptPresent = false,
  outputConfigured = false,
  outputExists = false,
  execute = false,
  confirmed = false
} = {}) {
  if (!p6EvidenceComplete) return waiting('READY_WAIT_P6_ACTUAL_CUTOVER');
  if (!p7InProgress) return waiting('READY_WAIT_P7_ACTIVATION');
  if (!productionGo) return waiting('READY_WAIT_PRODUCTION_GO');
  if (outputExists) return waiting('READY_EXISTING_OPERATIONS_SIGNOFF_INPUT_REQUIRES_COMPILER_VALIDATION');
  const missing = [];
  if (!p6EvidencePresent) missing.push('p6CutoverEvidence');
  for (const domain of OPERATIONS_SIGNOFF_DOMAINS) if (!domainEvidencePresent[domain]) missing.push(`${domain}Evidence`);
  if (!approvalReceiptPresent) missing.push('operationsOwnerApprovalReceipt');
  if (!outputConfigured) missing.push('output');
  if (missing.length) return waiting('READY_WAIT_OPERATIONS_SIGNOFF_ASSEMBLY_INPUTS', missing);
  if (!execute) return waiting('PASS_OPERATIONS_SIGNOFF_INPUT_ASSEMBLY_DRY_RUN_READY');
  if (!confirmed) return waiting('READY_WAIT_OPERATIONS_SIGNOFF_INPUT_ASSEMBLY_CONFIRMATION');
  return {
    status: 'READY_ASSEMBLE_PRODUCTION_OPERATIONS_SIGNOFF_INPUT', missing,
    inputReadAllowed: true, localEvidenceWriteAllowed: true, externalSignatureAllowed: false
  };
}

function validateP6Document(value, failures) {
  if (value?.schemaVersion !== 1) failures.push('p6:schemaVersion');
  if (value?.environment !== 'production' || value?.activationState !== 'actual') failures.push('p6:provenance');
  if (value?.evidenceType !== 'P6_CUTOVER_ACTUAL' || value?.domain !== 'p6-cutover' || value?.status !== 'PASS') failures.push('p6:contract');
  if (value?.targetUrl !== TARGET_URL || value?.productionGo !== true) failures.push('p6:productionGo');
  if (!RELEASE_SHA_PATTERN.test(value?.releaseSha ?? '')) failures.push('p6:releaseSha');
}

function validateDomainDocument(domain, value, failures) {
  if (value?.schemaVersion !== 1) failures.push(`${domain}:schemaVersion`);
  if (value?.environment !== 'production' || value?.activationState !== 'actual') failures.push(`${domain}:provenance`);
  if (value?.evidenceType !== 'P7_OPERATIONS_DOMAIN_ACTUAL' || value?.domain !== domain || value?.status !== 'PASS') failures.push(`${domain}:contract`);
  if (!validDate(value?.checkedAt)) failures.push(`${domain}:checkedAt`);
}

export function buildOperationsSignoffInput({
  p6Document,
  domainDocuments = {},
  approvalReceipt,
  hashes = {},
  checkedAt = new Date().toISOString()
} = {}) {
  const failures = [];
  if (!validDate(checkedAt)) failures.push('checkedAt');
  validateP6Document(p6Document, failures);
  if (!SHA256_PATTERN.test(hashes.p6Cutover ?? '')) failures.push('p6:sha256');
  for (const domain of OPERATIONS_SIGNOFF_DOMAINS) {
    validateDomainDocument(domain, domainDocuments[domain], failures);
    if (!SHA256_PATTERN.test(hashes.domains?.[domain] ?? '')) failures.push(`${domain}:sha256`);
  }
  if (domainDocuments.maintenance?.provenance?.releaseSha !== p6Document?.releaseSha) failures.push('maintenance:releaseShaMismatch');

  const receipt = approvalReceipt ?? {};
  if (receipt.schemaVersion !== 1 || receipt.template !== false) failures.push('receipt:contract');
  if (receipt.environment !== 'production' || receipt.activationState !== 'actual') failures.push('receipt:provenance');
  if (receipt.evidenceType !== OPERATIONS_OWNER_APPROVAL_RECEIPT_TYPE || receipt.targetUrl !== TARGET_URL) failures.push('receipt:typeTarget');
  if (receipt.decision !== 'APPROVED' || receipt.role !== 'OPERATIONS_OWNER') failures.push('receipt:decisionRole');
  if (!IDENTITY_PATTERN.test(receipt.signedByRef ?? '')) failures.push('receipt:signedByRef');
  if (!validDate(receipt.signedAt)) failures.push('receipt:signedAt');
  if (!RECEIPT_PATTERN.test(receipt.receiptId ?? '')) failures.push('receipt:receiptId');
  if (receipt.blockingExceptionCount !== 0) failures.push('receipt:blockingExceptionCount');
  if (receipt.releaseSha !== p6Document?.releaseSha) failures.push('receipt:releaseSha');
  if (receipt.p6CutoverEvidenceSha256 !== hashes.p6Cutover) failures.push('receipt:p6CutoverEvidenceSha256');
  if (JSON.stringify(receipt.acceptedDuties) !== JSON.stringify(OPERATIONS_SIGNOFF_DUTIES)) failures.push('receipt:acceptedDuties');

  const attestations = Array.isArray(receipt.attestations) ? receipt.attestations : [];
  if (JSON.stringify(attestations.map((item) => item?.domain)) !== JSON.stringify(OPERATIONS_SIGNOFF_DOMAINS)) failures.push('receipt:attestationOrder');
  const evidenceHashes = [];
  for (const [index, domain] of OPERATIONS_SIGNOFF_DOMAINS.entries()) {
    const item = attestations[index];
    if (item?.status !== 'PASS' || item?.evidenceSha256 !== hashes.domains?.[domain]) failures.push(`receipt:${domain}Attestation`);
    if (SHA256_PATTERN.test(item?.evidenceSha256 ?? '')) evidenceHashes.push(item.evidenceSha256);
  }
  if (new Set(evidenceHashes).size !== OPERATIONS_SIGNOFF_DOMAINS.length) failures.push('receipt:uniqueAttestationHashes');

  const checkedMs = Date.parse(checkedAt);
  const signedMs = Date.parse(receipt.signedAt);
  if (validDate(checkedAt) && validDate(receipt.signedAt)
    && (signedMs > checkedMs || checkedMs - signedMs > 24 * 60 * 60000)) failures.push('receipt:freshness');

  if (failures.length) throw new Error(`OPERATIONS_SIGNOFF_INPUT_ASSEMBLY_INVALID:${[...new Set(failures)].join(',')}`);
  const output = {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
    evidenceType: 'PRODUCTION_OPERATIONS_SIGNOFF_EXPORT', targetUrl: TARGET_URL,
    releaseSha: p6Document.releaseSha, p6CutoverEvidenceSha256: hashes.p6Cutover,
    signoff: {
      decision: receipt.decision, role: receipt.role, signedByRef: receipt.signedByRef,
      signedAt: receipt.signedAt, receiptId: receipt.receiptId,
      blockingExceptionCount: receipt.blockingExceptionCount,
      attestations: attestations.map((item) => ({ domain: item.domain, status: item.status, evidenceSha256: item.evidenceSha256 })),
      acceptedDuties: [...receipt.acceptedDuties]
    }
  };
  const compilerCheck = compileOperationsSignoffEvidence(output, { checkedAt, sourceSha256: '0'.repeat(64) });
  if (!compilerCheck.evidence) throw new Error(`OPERATIONS_SIGNOFF_INPUT_COMPILER_INCOMPATIBLE:${compilerCheck.failures.join(',')}`);
  return output;
}

export function sha256OperationsDocument(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function writeOperationsSignoffInputOnce(outputPath, value, { processId = process.pid } = {}) {
  return writeCreateOnlyJsonOutput(outputPath, value, { processId });
}
