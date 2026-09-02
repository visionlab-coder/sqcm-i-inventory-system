import fs from 'node:fs';
import path from 'node:path';
import { writeCreateOnlyJsonOutput } from './operations-create-only-json-output.mjs';
import { TextDecoder } from 'node:util';

export const IMPROVEMENT_QUEUE_COLLECTION_CONFIRMATION = 'ACK-COLLECT-P7-PRODUCTION-IMPROVEMENT-QUEUE';
export const IMPROVEMENT_QUEUE_REPOSITORY = 'visionlab-coder/sqcm-i-inventory-system';
export const IMPROVEMENT_QUEUE_LABEL = 'operations';
export const GITHUB_ISSUE_PAGE_MAX_BYTES = 1024 * 1024;

const ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const ACCEPTANCE_PATTERN = /^acceptance:\/\/[A-Za-z0-9._/@:-]+$/;
const ISSUE_REF_PATTERN = /^github:\/\/visionlab-coder\/sqcm-i-inventory-system\/issues\/[1-9][0-9]*$/;
const SOURCES = new Set(['incident', 'security', 'performance', 'dependency', 'migration', 'backup', 'user_feedback']);
const SEVERITIES = new Set(['P1', 'P2', 'P3', 'P4']);
const STATUSES = new Set(['TODO', 'IN_PROGRESS', 'BLOCKED']);
const METADATA_PATTERN = /<!--\s*SQCM_I_OPERATIONS_ITEM\s+(\{[\s\S]{1,4096}?\})\s*-->/g;

function waiting(status, missing = []) {
  return { status, missing, githubReadAllowed: false, localEvidenceWriteAllowed: false, secretReadAllowed: false };
}

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export async function readBoundedGitHubIssuePage(response, { maxBytes = GITHUB_ISSUE_PAGE_MAX_BYTES } = {}) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > GITHUB_ISSUE_PAGE_MAX_BYTES) {
    throw new Error('GITHUB_ISSUE_RESPONSE_BOUND_INVALID');
  }
  const declared = response?.headers?.get?.('content-length');
  if (declared !== null && declared !== undefined) {
    if (!/^[0-9]+$/.test(declared)) throw new Error('GITHUB_ISSUE_RESPONSE_INVALID');
    if (Number(declared) > maxBytes) throw new Error('GITHUB_ISSUE_RESPONSE_TOO_LARGE');
  }
  if (!response?.body?.getReader) throw new Error('GITHUB_ISSUE_RESPONSE_INVALID');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error('GITHUB_ISSUE_RESPONSE_INVALID');
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('GITHUB_ISSUE_RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } catch (error) {
    try { await reader.cancel(); } catch {}
    if (error?.message === 'GITHUB_ISSUE_RESPONSE_TOO_LARGE' || error?.message === 'GITHUB_ISSUE_RESPONSE_INVALID') throw error;
    throw new Error('GITHUB_ISSUE_RESPONSE_READ_FAILED');
  } finally {
    reader.releaseLock?.();
  }
  const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { throw new Error('GITHUB_ISSUE_RESPONSE_INVALID_UTF8'); }
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error('GITHUB_ISSUE_RESPONSE_INVALID'); }
  if (!Array.isArray(value)) throw new Error('GITHUB_ISSUE_RESPONSE_INVALID');
  return value;
}

export function evaluateImprovementQueueCollectionGate({
  p6EvidenceComplete = false,
  p7InProgress = false,
  productionGo = false,
  tokenReferencePresent = false,
  attestationPresent = false,
  outputConfigured = false,
  outputExists = false,
  execute = false,
  confirmed = false
} = {}) {
  if (!p6EvidenceComplete) return waiting('READY_WAIT_P6_ACTUAL_CUTOVER');
  if (!p7InProgress) return waiting('READY_WAIT_P7_ACTIVATION');
  if (!productionGo) return waiting('READY_WAIT_PRODUCTION_GO');
  if (outputExists) return waiting('PASS_IMPROVEMENT_QUEUE_EXPORT_ALREADY_COMPLETE');
  const missing = [];
  if (!tokenReferencePresent) missing.push('tokenReference');
  if (!attestationPresent) missing.push('triageAttestation');
  if (!outputConfigured) missing.push('output');
  if (missing.length) return waiting('READY_WAIT_IMPROVEMENT_QUEUE_COLLECTION_INPUTS', missing);
  if (!execute) return waiting('PASS_IMPROVEMENT_QUEUE_COLLECTION_DRY_RUN_READY');
  if (!confirmed) return waiting('READY_WAIT_IMPROVEMENT_QUEUE_COLLECTION_CONFIRMATION');
  return {
    status: 'READY_COLLECT_PRODUCTION_IMPROVEMENT_QUEUE',
    missing,
    githubReadAllowed: true,
    localEvidenceWriteAllowed: true,
    secretReadAllowed: true
  };
}

export function validateImprovementQueueTriageAttestation(value, { checkedAt = new Date().toISOString() } = {}) {
  const failures = [];
  if (value?.schemaVersion !== 1) failures.push('schemaVersion');
  if (value?.environment !== 'production') failures.push('environment');
  if (value?.approved !== true) failures.push('approved');
  if (value?.repository !== IMPROVEMENT_QUEUE_REPOSITORY) failures.push('repository');
  if (value?.label !== IMPROVEMENT_QUEUE_LABEL) failures.push('label');
  if (!IDENTITY_PATTERN.test(value?.triageOwnerRef ?? '')) failures.push('triageOwnerRef');
  if (!ID_PATTERN.test(value?.triageReceiptId ?? '')) failures.push('triageReceiptId');
  if (value?.untrackedFindingCount !== 0) failures.push('untrackedFindingCount');
  if (!validDate(checkedAt)) failures.push('checkedAt');
  for (const field of ['lastTriagedAt', 'nextTriageAt']) if (!validDate(value?.[field])) failures.push(field);
  const checkedMs = Date.parse(checkedAt);
  const lastMs = Date.parse(value?.lastTriagedAt);
  const nextMs = Date.parse(value?.nextTriageAt);
  if (Number.isFinite(checkedMs) && Number.isFinite(lastMs)
    && (lastMs > checkedMs || checkedMs - lastMs > 7 * 86400000)) failures.push('lastTriagedAtWindow');
  if (Number.isFinite(checkedMs) && Number.isFinite(nextMs)
    && (nextMs <= checkedMs || nextMs - checkedMs > 7 * 86400000)) failures.push('nextTriageAtWindow');
  if (failures.length) throw new Error(`IMPROVEMENT_QUEUE_TRIAGE_ATTESTATION_INVALID:${[...new Set(failures)].join(',')}`);
  return value;
}

function issueLabels(issue) {
  return (Array.isArray(issue?.labels) ? issue.labels : []).map((label) => typeof label === 'string' ? label : label?.name).filter(Boolean);
}

export function parseOperationsIssue(issue) {
  const failures = [];
  if (issue?.pull_request) failures.push('pullRequest');
  if (!Number.isInteger(issue?.number) || issue.number < 1) failures.push('number');
  if (issue?.state !== 'open') failures.push('state');
  if (!validDate(issue?.created_at)) failures.push('createdAt');
  const labels = issueLabels(issue);
  if (!labels.includes(IMPROVEMENT_QUEUE_LABEL)) failures.push('operationsLabel');
  const matches = [...String(issue?.body ?? '').matchAll(METADATA_PATTERN)];
  if (matches.length !== 1) failures.push('metadataBlock');
  let metadata = {};
  if (matches.length === 1) {
    try { metadata = JSON.parse(matches[0][1]); } catch { failures.push('metadataJson'); }
  }
  if (!SOURCES.has(metadata.source)) failures.push('source');
  if (!SEVERITIES.has(metadata.severity)) failures.push('severity');
  if (!STATUSES.has(metadata.status)) failures.push('status');
  if (!IDENTITY_PATTERN.test(metadata.ownerRef ?? '')) failures.push('ownerRef');
  if (!ACCEPTANCE_PATTERN.test(metadata.acceptanceRef ?? '')) failures.push('acceptanceRef');
  for (const field of ['triagedAt', 'nextActionAt']) if (!validDate(metadata[field])) failures.push(field);
  if (metadata.status === 'BLOCKED' && !ISSUE_REF_PATTERN.test(metadata.blockerRef ?? '')) failures.push('blockerRef');
  for (const expected of [`source:${metadata.source}`, `severity:${metadata.severity}`, `status:${metadata.status}`]) {
    if (!labels.includes(expected)) failures.push(`label:${expected}`);
  }
  const createdMs = Date.parse(issue?.created_at);
  const triagedMs = Date.parse(metadata.triagedAt);
  if (Number.isFinite(createdMs) && Number.isFinite(triagedMs) && triagedMs < createdMs) failures.push('triageBeforeCreation');
  if (failures.length) throw new Error(`OPERATIONS_ISSUE_INVALID:${[...new Set(failures)].join(',')}`);
  return {
    issueRef: `github://${IMPROVEMENT_QUEUE_REPOSITORY}/issues/${issue.number}`,
    source: metadata.source,
    severity: metadata.severity,
    status: metadata.status,
    ownerRef: metadata.ownerRef,
    acceptanceRef: metadata.acceptanceRef,
    createdAt: new Date(createdMs).toISOString(),
    triagedAt: new Date(triagedMs).toISOString(),
    nextActionAt: new Date(Date.parse(metadata.nextActionAt)).toISOString(),
    ...(metadata.blockerRef ? { blockerRef: metadata.blockerRef } : {})
  };
}

export function buildImprovementQueueExport({ issues, attestation, exportedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(issues)) throw new Error('GITHUB_ISSUES_REQUIRED');
  if (!validDate(exportedAt)) throw new Error('EXPORTED_AT_INVALID');
  const approved = validateImprovementQueueTriageAttestation(attestation, { checkedAt: exportedAt });
  const items = issues.map(parseOperationsIssue).sort((left, right) => Number(left.issueRef.split('/').at(-1)) - Number(right.issueRef.split('/').at(-1)));
  if (new Set(items.map((item) => item.issueRef)).size !== items.length) throw new Error('GITHUB_ISSUE_DUPLICATE');
  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'actual',
    evidenceType: 'PRODUCTION_IMPROVEMENT_QUEUE_EXPORT',
    targetUrl: 'https://inventory.safe-link.co.kr',
    queue: {
      provider: 'GITHUB_ISSUES',
      repository: IMPROVEMENT_QUEUE_REPOSITORY,
      queueRef: `github://${IMPROVEMENT_QUEUE_REPOSITORY}/issues?label=${IMPROVEMENT_QUEUE_LABEL}`,
      triageOwnerRef: approved.triageOwnerRef,
      triageReceiptId: approved.triageReceiptId,
      exportedAt: new Date(Date.parse(exportedAt)).toISOString(),
      lastTriagedAt: new Date(Date.parse(approved.lastTriagedAt)).toISOString(),
      nextTriageAt: new Date(Date.parse(approved.nextTriageAt)).toISOString(),
      untrackedFindingCount: 0,
      openItemCount: items.length,
      items
    }
  };
}

export function writeImprovementQueueExportOnce(outputPath, value, { processId = process.pid } = {}) {
  return writeCreateOnlyJsonOutput(outputPath, value, { processId });
}
