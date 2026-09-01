import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { HANDOVER_DOMAINS } from './operations-handover-preflight.mjs';

const REQUIRED_SIGNALS = ['availability', 'latency_p95', 'http_5xx', 'backup_failure', 'certificate_expiry'];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validReference(reference) {
  return reference
    && typeof reference === 'object'
    && !Array.isArray(reference)
    && typeof reference.path === 'string'
    && reference.path.trim().length >= 3
    && SHA256_PATTERN.test(reference.sha256 ?? '');
}

export function loadActualOperationsEvidenceDocument(reference, { baseDir } = {}) {
  if (!reference || typeof reference.path !== 'string' || !baseDir) return { loadError: 'reference or base directory missing' };
  try {
    const absolutePath = path.isAbsolute(reference.path) ? path.resolve(reference.path) : path.resolve(baseDir, reference.path);
    const raw = fs.readFileSync(absolutePath);
    return { actualSha256: createHash('sha256').update(raw).digest('hex'), value: JSON.parse(raw.toString('utf8')) };
  } catch {
    return { loadError: 'file missing, unreadable or invalid JSON' };
  }
}

export function loadActualOperationsHandoverBundle(evidence, { baseDir } = {}) {
  const documents = {
    p6Gate: loadActualOperationsEvidenceDocument(evidence?.p6Gate?.evidenceRef, { baseDir }),
    operationsSignoff: loadActualOperationsEvidenceDocument(evidence?.operationsSignoff?.evidenceRef, { baseDir })
  };
  for (const name of HANDOVER_DOMAINS) documents[name] = loadActualOperationsEvidenceDocument(evidence?.domains?.[name]?.evidenceRef, { baseDir });
  return documents;
}

function validateReference(reference, document, label, failures) {
  if (!validReference(reference)) {
    failures.push(`${label} evidence reference must contain path and sha256`);
    return false;
  }
  if (!document || document.loadError) {
    failures.push(`${label} evidence file is missing or unreadable`);
    return false;
  }
  if (document.actualSha256 !== reference.sha256) {
    failures.push(`${label} evidence sha256 mismatch`);
    return false;
  }
  return true;
}

function validateCommonDocument(document, { evidenceType, domain, status = 'PASS' }, failures) {
  const value = document.value;
  if (!value || value.schemaVersion !== 1) failures.push(`${domain} evidence schemaVersion must be 1`);
  if (value?.environment !== 'production') failures.push(`${domain} evidence environment must be production`);
  if (value?.activationState !== 'actual') failures.push(`${domain} evidence activationState must be actual`);
  if (value?.evidenceType !== evidenceType) failures.push(`${domain} evidenceType mismatch`);
  if (value?.domain !== domain) failures.push(`${domain} evidence domain mismatch`);
  if (value?.status !== status) failures.push(`${domain} evidence status must be ${status}`);
  if (!validDate(value?.checkedAt)) failures.push(`${domain} evidence checkedAt is required`);
  return value;
}

function validateDomainMetrics(name, metrics, failures) {
  if (!metrics || typeof metrics !== 'object') {
    failures.push(`${name} metrics are required`);
    return;
  }
  if (name === 'slo' && !(metrics.availabilityPercent >= 99.5 && metrics.p95Ms <= 1000 && metrics.measurementWindowDays === 30 && metrics.sampleCount > 0)) failures.push('slo metrics must meet availability, p95, window and sample contracts');
  if (name === 'alerting') {
    const signals = Array.isArray(metrics.signals) ? metrics.signals : [];
    if (JSON.stringify(signals.map((item) => item.id)) !== JSON.stringify(REQUIRED_SIGNALS)
      || !signals.every((item) => item.received === true && typeof item.receiptId === 'string' && item.receiptId.length >= 3)) failures.push('alerting must contain five ordered received signal receipts');
  }
  if (name === 'backup' && !(metrics.offsite === true && metrics.checksumVerified === true && metrics.ageMinutes >= 0 && metrics.ageMinutes <= 1440)) failures.push('backup must be off-site, checksum verified and within RPO');
  if (name === 'restore' && !(metrics.isolatedTarget === true && metrics.rowCountsMatch === true && metrics.rtoMinutes >= 0 && metrics.rtoMinutes <= 240)) failures.push('restore must be isolated, row-count verified and within RTO');
  if (name === 'certificate' && !(metrics.hostname === 'inventory.safe-link.co.kr' && metrics.tlsValid === true && metrics.daysRemaining >= 30)) failures.push('certificate must match hostname, TLS validity and renewal lead');
  if (name === 'onCall' && !(IDENTITY_PATTERN.test(metrics.primaryOwnerRef ?? '') && IDENTITY_PATTERN.test(metrics.escalationOwnerRef ?? ''))) failures.push('onCall primary and escalation identity references are required');
  if (name === 'maintenance' && !(metrics.contractRef === 'docs/maintenance.md' && metrics.executionPassed === true && validDate(metrics.executedAt))) failures.push('maintenance execution evidence must pass the approved contract');
  if (name === 'improvementQueue' && !(typeof metrics.queueRef === 'string' && metrics.queueRef.length >= 3 && IDENTITY_PATTERN.test(metrics.triageOwnerRef ?? ''))) failures.push('improvementQueue queue and triage owner references are required');
}

export function validateActualOperationsHandoverEvidence(evidence, { documents = {} } = {}) {
  const failures = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return { status: 'BLOCKED_ACTUAL_HANDOVER_EVIDENCE_INVALID', failures: ['evidence must be an object'], p7CompletionReady: false };
  if (evidence.schemaVersion !== 2) failures.push('schemaVersion must be 2');
  if (evidence.template === true) failures.push('template evidence cannot complete P7');
  if (evidence.environment !== 'production') failures.push('environment must be production');
  if (evidence.activationState !== 'actual') failures.push('activationState must be actual');

  const p6Reference = evidence.p6Gate?.evidenceRef;
  if (evidence.p6Gate?.status !== 'PASS') failures.push('actual P6 Production cutover PASS evidence is required');
  if (validateReference(p6Reference, documents.p6Gate, 'p6Gate', failures)) {
    const p6 = validateCommonDocument(documents.p6Gate, { evidenceType: 'P6_CUTOVER_ACTUAL', domain: 'p6-cutover' }, failures);
    if (p6?.productionGo !== true || p6?.targetUrl !== 'https://inventory.safe-link.co.kr' || !/^[a-f0-9]{40}$/.test(p6?.releaseSha ?? '')) failures.push('p6Gate actual cutover URL, release SHA and productionGo are required');
  }

  for (const name of HANDOVER_DOMAINS) {
    const domain = evidence.domains?.[name];
    if (!domain || domain.status !== 'PASS') {
      failures.push(`${name} actual Production PASS evidence is required`);
      continue;
    }
    if (validateReference(domain.evidenceRef, documents[name], name, failures)) {
      const value = validateCommonDocument(documents[name], { evidenceType: 'P7_OPERATIONS_DOMAIN_ACTUAL', domain: name }, failures);
      validateDomainMetrics(name, value?.metrics, failures);
    }
  }

  const signoff = evidence.operationsSignoff || {};
  if (signoff.status !== 'APPROVED') failures.push('operations signoff must be APPROVED');
  if (!IDENTITY_PATTERN.test(signoff.signedByRef ?? '')) failures.push('operations signoff signedByRef must be an identity reference');
  if (!validDate(signoff.signedAt)) failures.push('operations signoff signedAt is required');
  if (validateReference(signoff.evidenceRef, documents.operationsSignoff, 'operationsSignoff', failures)) {
    const value = validateCommonDocument(documents.operationsSignoff, { evidenceType: 'P7_OPERATIONS_SIGNOFF_ACTUAL', domain: 'operations-signoff', status: 'APPROVED' }, failures);
    if (value?.signedByRef !== signoff.signedByRef || value?.signedAt !== signoff.signedAt) failures.push('operations signoff identity or timestamp does not match signed evidence');
  }

  return {
    status: failures.length === 0 ? 'PASS_ACTUAL_OPERATIONS_HANDOVER_EVIDENCE' : 'BLOCKED_ACTUAL_HANDOVER_EVIDENCE_INVALID',
    failures,
    requiredDomainCount: HANDOVER_DOMAINS.length,
    verifiedDocumentCount: Object.values(documents).filter((document) => document && !document.loadError).length,
    p7CompletionReady: failures.length === 0
  };
}
