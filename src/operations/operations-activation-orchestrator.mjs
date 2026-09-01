import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const OPERATIONS_ACTIVATION_CONFIRMATION = 'ACK-EXECUTE-P7-PRODUCTION-OPERATIONS-ACTIVATION';
export const OPERATIONS_ACTIVATION_ACTIONS = [
  'slo-production-https-read', 'alert-test-delivery', 'offsite-backup-write', 'isolated-restore-database',
  'certificate-production-https-read', 'oncall-test-message', 'maintenance-production-read',
  'github-operations-read', 'local-evidence-write', 'phase-completion-state-write'
];

const OPERATIONS_ACTIVATION_STEP_ENVIRONMENT = {
  'slo-collect': ['P7_SLO_LEDGER_FILE', 'P7_SLO_MEASUREMENT_INPUT_FILE', 'P7_SLO_COLLECTION_CONFIRMATION'],
  'slo-compile': ['P7_SLO_MEASUREMENT_INPUT_FILE', 'P7_SLO_EVIDENCE_OUTPUT_FILE', 'P7_SLO_EVIDENCE_CONFIRMATION'],
  'alert-deliver': ['P7_ALERT_DELIVERY_PROVIDER_MANIFEST_FILE', 'P7_ALERT_DELIVERY_API_TOKEN_FILE', 'P7_ALERT_RECEIPT_INPUT_FILE', 'P7_ALERT_DELIVERY_CONFIRMATION'],
  'alert-compile': ['P7_ALERT_RECEIPT_INPUT_FILE', 'P7_ALERTING_EVIDENCE_OUTPUT_FILE', 'P7_ALERTING_EVIDENCE_CONFIRMATION'],
  'backup-restore-run': ['P7_OFFSITE_BACKUP_ROOT', 'P7_OFFSITE_STORAGE_ATTESTATION_FILE', 'P7_BACKUP_RESTORE_DRILL_INPUT_FILE', 'P7_BACKUP_RESTORE_RUNNER_CONFIRMATION'],
  'backup-restore-compile': ['P7_BACKUP_RESTORE_DRILL_INPUT_FILE', 'P7_BACKUP_EVIDENCE_OUTPUT_FILE', 'P7_RESTORE_EVIDENCE_OUTPUT_FILE', 'P7_BACKUP_RESTORE_EVIDENCE_CONFIRMATION'],
  'certificate-observe': ['P7_CERTIFICATE_OBSERVATION_INPUT_FILE', 'P7_CERTIFICATE_RENEWAL_OWNER_REF', 'P7_CERTIFICATE_PROVIDER_REF', 'P7_CERTIFICATE_OBSERVATION_CONFIRMATION'],
  'certificate-compile': ['P7_CERTIFICATE_OBSERVATION_INPUT_FILE', 'P7_CERTIFICATE_EVIDENCE_OUTPUT_FILE', 'P7_CERTIFICATE_EVIDENCE_CONFIRMATION'],
  'oncall-drill': ['P7_ONCALL_DRILL_PROVIDER_MANIFEST_FILE', 'P7_ONCALL_DRILL_API_TOKEN_FILE', 'P7_ONCALL_HANDOVER_INPUT_FILE', 'P7_ONCALL_DRILL_CONFIRMATION'],
  'oncall-compile': ['P7_ONCALL_HANDOVER_INPUT_FILE', 'P7_ONCALL_EVIDENCE_OUTPUT_FILE', 'P7_ONCALL_EVIDENCE_CONFIRMATION'],
  'maintenance-run': ['P7_MAINTENANCE_EXECUTION_INPUT_FILE', 'P7_MAINTENANCE_OPERATOR_REF', 'P7_MAINTENANCE_SCHEDULE_REF', 'P7_MAINTENANCE_NEXT_SCHEDULED_AT', 'P7_MAINTENANCE_RUNNER_CONFIRMATION'],
  'maintenance-compile': ['P7_MAINTENANCE_EXECUTION_INPUT_FILE', 'P7_MAINTENANCE_EVIDENCE_OUTPUT_FILE', 'P7_MAINTENANCE_EVIDENCE_CONFIRMATION'],
  'improvement-collect': ['P7_GITHUB_API_TOKEN_FILE', 'P7_IMPROVEMENT_QUEUE_TRIAGE_ATTESTATION_FILE', 'P7_IMPROVEMENT_QUEUE_INPUT_FILE', 'P7_IMPROVEMENT_QUEUE_COLLECTION_CONFIRMATION'],
  'improvement-compile': ['P7_IMPROVEMENT_QUEUE_INPUT_FILE', 'P7_IMPROVEMENT_QUEUE_EVIDENCE_OUTPUT_FILE', 'P7_IMPROVEMENT_QUEUE_EVIDENCE_CONFIRMATION'],
  'signoff-input-assemble': ['P7_P6_CUTOVER_EVIDENCE_FILE', 'P7_OPERATIONS_OWNER_APPROVAL_RECEIPT_FILE', 'P7_OPERATIONS_SIGNOFF_INPUT_FILE', 'P7_SLO_EVIDENCE_FILE', 'P7_ALERTING_EVIDENCE_FILE', 'P7_BACKUP_EVIDENCE_FILE', 'P7_RESTORE_EVIDENCE_FILE', 'P7_CERTIFICATE_EVIDENCE_FILE', 'P7_ONCALL_EVIDENCE_FILE', 'P7_MAINTENANCE_EVIDENCE_FILE', 'P7_IMPROVEMENT_QUEUE_EVIDENCE_FILE', 'P7_OPERATIONS_SIGNOFF_INPUT_ASSEMBLY_CONFIRMATION'],
  'signoff-compile': ['P7_OPERATIONS_SIGNOFF_INPUT_FILE', 'P7_OPERATIONS_SIGNOFF_EVIDENCE_OUTPUT_FILE', 'P7_OPERATIONS_SIGNOFF_EVIDENCE_CONFIRMATION'],
  'handover-assemble': ['P7_P6_CUTOVER_EVIDENCE_FILE', 'P7_SLO_EVIDENCE_FILE', 'P7_ALERTING_EVIDENCE_FILE', 'P7_BACKUP_EVIDENCE_FILE', 'P7_RESTORE_EVIDENCE_FILE', 'P7_CERTIFICATE_EVIDENCE_FILE', 'P7_ONCALL_EVIDENCE_FILE', 'P7_MAINTENANCE_EVIDENCE_FILE', 'P7_IMPROVEMENT_QUEUE_EVIDENCE_FILE', 'P7_OPERATIONS_SIGNOFF_EVIDENCE_FILE', 'P7_HANDOVER_MANIFEST_OUTPUT_FILE', 'P7_HANDOVER_ASSEMBLY_CONFIRMATION'],
  'handover-finalize': ['OPERATIONS_HANDOVER_ACTUAL_EVIDENCE_FILE'],
  'phase-complete': ['OPERATIONS_HANDOVER_ACTUAL_EVIDENCE_FILE', 'P7_COMPLETION_CONFIRMATION']
};

export const OPERATIONS_ACTIVATION_STEPS = [
  { id: 'slo-collect', script: 'operations-slo-collector.mjs', args: ['--collect'], pass: ['PASS_P7_SLO_30_DAY_EXPORT_CREATED', 'PASS_P7_SLO_30_DAY_EXPORT_ALREADY_COMPLETE'] },
  { id: 'slo-compile', script: 'operations-slo-evidence.mjs', args: ['--compile'], pass: ['PASS_SLO_EVIDENCE_COMPILED'] },
  { id: 'alert-deliver', script: 'operations-alert-delivery-runner.mjs', args: ['--send'], pass: ['PASS_PRODUCTION_ALERT_DELIVERY_RECEIPT_EXPORT_CREATED', 'PASS_ALERT_DELIVERY_EXPORT_ALREADY_COMPLETE'] },
  { id: 'alert-compile', script: 'operations-alerting-evidence.mjs', args: ['--compile'], pass: ['PASS_ALERTING_EVIDENCE_COMPILED'] },
  { id: 'backup-restore-run', script: 'operations-backup-restore-runner.mjs', args: ['--execute'], pass: ['PASS_PRODUCTION_OFFSITE_BACKUP_RESTORE_DRILL_EXPORT_CREATED'] },
  { id: 'backup-restore-compile', script: 'operations-backup-restore-evidence.mjs', args: ['--compile'], pass: ['PASS_BACKUP_RESTORE_EVIDENCE_COMPILED'] },
  { id: 'certificate-observe', script: 'operations-certificate-observer.mjs', args: ['--observe'], pass: ['PASS_PRODUCTION_TLS_CERTIFICATE_OBSERVATION_CREATED'] },
  { id: 'certificate-compile', script: 'operations-certificate-evidence.mjs', args: ['--compile'], pass: ['PASS_CERTIFICATE_EVIDENCE_COMPILED'] },
  { id: 'oncall-drill', script: 'operations-oncall-drill-runner.mjs', args: ['--send'], pass: ['PASS_PRODUCTION_ONCALL_ESCALATION_DRILL_EXPORT_CREATED', 'PASS_ONCALL_DRILL_EXPORT_ALREADY_COMPLETE'] },
  { id: 'oncall-compile', script: 'operations-oncall-evidence.mjs', args: ['--compile'], pass: ['PASS_ONCALL_EVIDENCE_COMPILED'] },
  { id: 'maintenance-run', script: 'operations-maintenance-runner.mjs', args: ['--execute'], pass: ['PASS_PRODUCTION_DAILY_MAINTENANCE_EXPORT_CREATED'] },
  { id: 'maintenance-compile', script: 'operations-maintenance-evidence.mjs', args: ['--compile'], pass: ['PASS_MAINTENANCE_EVIDENCE_COMPILED'] },
  { id: 'improvement-collect', script: 'operations-improvement-queue-collector.mjs', args: ['--collect'], pass: ['PASS_PRODUCTION_IMPROVEMENT_QUEUE_EXPORT_CREATED', 'PASS_IMPROVEMENT_QUEUE_EXPORT_ALREADY_COMPLETE'] },
  { id: 'improvement-compile', script: 'operations-improvement-queue-evidence.mjs', args: ['--compile'], pass: ['PASS_IMPROVEMENT_QUEUE_EVIDENCE_COMPILED'] },
  { id: 'signoff-input-assemble', script: 'operations-signoff-input-assembler.mjs', args: ['--assemble'], pass: ['PASS_PRODUCTION_OPERATIONS_SIGNOFF_INPUT_ASSEMBLED', 'READY_EXISTING_OPERATIONS_SIGNOFF_INPUT_REQUIRES_COMPILER_VALIDATION'] },
  { id: 'signoff-compile', script: 'operations-signoff-evidence.mjs', args: ['--compile'], pass: ['PASS_OPERATIONS_SIGNOFF_EVIDENCE_COMPILED'] },
  { id: 'handover-assemble', script: 'operations-handover-assembler.mjs', args: ['--assemble'], pass: ['PASS_HANDOVER_MANIFEST_ASSEMBLED'] },
  { id: 'handover-finalize', script: 'operations-handover-finalizer.mjs', args: [], pass: ['PASS_ACTUAL_OPERATIONS_HANDOVER_EVIDENCE'] },
  { id: 'phase-complete', script: 'operations-phase-completion.mjs', args: ['--complete'], pass: ['PASS_ALL_PHASES_COMPLETE_8_OF_8'] }
].map((step) => ({ ...step, environment: [...OPERATIONS_ACTIVATION_STEP_ENVIRONMENT[step.id]] }));

export const OPERATIONS_ACTIVATION_BUNDLE_ENTRYPOINTS = [...new Set([
  'scripts/operations-activation-orchestrator.mjs',
  'src/operations/operations-activation-orchestrator.mjs',
  ...OPERATIONS_ACTIVATION_STEPS.map((step) => `scripts/${step.script}`)
])].sort();

const ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const P6_OPERATIONS_APPROVAL_EVIDENCE_PATTERN = /^production operations approval sha256:([a-f0-9]{64})$/;
export const OPERATIONS_ACTIVATION_APPROVAL_RECEIPT_TYPE = 'P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT';
const RECEIPT_ROOT_CLAIM_NAME = '.operations-activation-root.json';

function waiting(status, missing = []) {
  return { status, missing, childProcessAllowed: false, approvalReadAllowed: false, receiptWriteAllowed: false };
}

function validDate(value) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function operationsActivationApprovalSha256(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

const LOCAL_MODULE_SPECIFIER_PATTERN = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

function resolveLocalModulePath(fromFile, specifier) {
  const unresolved = path.resolve(path.dirname(fromFile), specifier.split(/[?#]/, 1)[0]);
  const candidates = path.extname(unresolved)
    ? [unresolved]
    : [unresolved, `${unresolved}.mjs`, `${unresolved}.js`, `${unresolved}.cjs`, `${unresolved}.json`, path.join(unresolved, 'index.mjs'), path.join(unresolved, 'index.js')];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function resolveOperationsActivationBundleFiles(projectRoot) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)) throw new Error('OPERATIONS_ACTIVATION_BUNDLE_ROOT_INVALID');
  const root = path.resolve(projectRoot); const pending = [...OPERATIONS_ACTIVATION_BUNDLE_ENTRYPOINTS]; const resolved = new Set();
  while (pending.length) {
    const relativePath = pending.pop(); if (resolved.has(relativePath)) continue;
    const candidate = path.resolve(root, ...relativePath.split('/')); const relative = path.relative(root, candidate);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('OPERATIONS_ACTIVATION_BUNDLE_PATH_INVALID');
    let stat; let realPath;
    try { stat = fs.lstatSync(candidate); realPath = path.resolve(fs.realpathSync(candidate)); } catch { throw new Error('OPERATIONS_ACTIVATION_BUNDLE_FILE_MISSING'); }
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false) || realPath.toLowerCase() !== candidate.toLowerCase()) {
      throw new Error('OPERATIONS_ACTIVATION_BUNDLE_FILE_NOT_PHYSICAL');
    }
    resolved.add(relativePath);
    if (path.extname(candidate) === '.json') continue;
    const source = fs.readFileSync(candidate, 'utf8');
    for (const match of source.matchAll(LOCAL_MODULE_SPECIFIER_PATTERN)) {
      const dependency = resolveLocalModulePath(candidate, match[1]);
      if (!dependency) throw new Error('OPERATIONS_ACTIVATION_BUNDLE_DEPENDENCY_MISSING');
      const dependencyRelative = path.relative(root, dependency);
      if (!dependencyRelative || dependencyRelative.startsWith('..') || path.isAbsolute(dependencyRelative)) throw new Error('OPERATIONS_ACTIVATION_BUNDLE_DEPENDENCY_OUTSIDE_ROOT');
      pending.push(dependencyRelative.split(path.sep).join('/'));
    }
  }
  return [...resolved].sort();
}

export function computeOperationsActivationBundleSha256(projectRoot) {
  const root = path.resolve(projectRoot); const hash = createHash('sha256');
  hash.update('SQCM-I-P7-OPERATIONS-ACTIVATION-BUNDLE-V2\0', 'utf8');
  for (const relativePath of resolveOperationsActivationBundleFiles(root)) {
    const candidate = path.resolve(root, ...relativePath.split('/')); const content = fs.readFileSync(candidate); const pathBytes = Buffer.byteLength(relativePath, 'utf8');
    hash.update(`${pathBytes}:`, 'utf8'); hash.update(relativePath, 'utf8'); hash.update(`:${content.length}:`, 'utf8'); hash.update(content);
  }
  return hash.digest('hex');
}

const SAFE_CHILD_RUNTIME_ENVIRONMENT = [
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR',
  'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA'
];

export function buildOperationsActivationChildEnvironment(step, sourceEnvironment = {}) {
  const contract = OPERATIONS_ACTIVATION_STEPS.find((item) => item.id === step?.id && item.script === step?.script);
  if (!contract) throw new Error('OPERATIONS_ACTIVATION_CHILD_ENVIRONMENT_STEP_INVALID');
  const sourceKeys = Object.keys(sourceEnvironment); const output = {}; const copied = new Set();
  for (const allowedName of [...SAFE_CHILD_RUNTIME_ENVIRONMENT, ...contract.environment]) {
    const canonicalName = allowedName.toUpperCase(); if (copied.has(canonicalName)) continue;
    const sourceKey = sourceKeys.find((key) => key.toUpperCase() === canonicalName);
    if (sourceKey && typeof sourceEnvironment[sourceKey] === 'string') { output[sourceKey] = sourceEnvironment[sourceKey]; copied.add(canonicalName); }
  }
  return output;
}

function writeJsonNoReplace(output, value, { processId = process.pid, temporaryId = randomUUID() } = {}) {
  const temporary = path.join(path.dirname(output), `.${path.basename(output)}.${processId}.${temporaryId}.tmp`);
  let handle = null;
  try {
    handle = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.fsyncSync(handle); fs.closeSync(handle); handle = null;
    fs.linkSync(temporary, output);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('NO_REPLACE_TARGET_EXISTS');
    throw error;
  } finally {
    if (handle !== null) fs.closeSync(handle);
    if (fs.existsSync(temporary)) fs.rmSync(temporary);
  }
  return output;
}

function validateReceiptRootClaim(value, { runIdSha256, releaseSha, approvalSha256 }) {
  if (value?.schemaVersion !== 2 || !DIGEST_PATTERN.test(value?.runIdSha256 ?? '') || !SHA_PATTERN.test(value?.releaseSha ?? '')
    || !DIGEST_PATTERN.test(value?.approvalSha256 ?? '') || !validDate(value?.claimedAt)
    || value?.secretValuesRecorded !== false) throw new Error('OPERATIONS_ACTIVATION_RECEIPT_ROOT_CLAIM_INVALID');
  if (value.runIdSha256 !== runIdSha256) throw new Error('OPERATIONS_ACTIVATION_RECEIPT_ROOT_RUN_MISMATCH');
  if (value.releaseSha !== releaseSha || value.approvalSha256 !== approvalSha256) throw new Error('OPERATIONS_ACTIVATION_RECEIPT_ROOT_APPROVAL_MISMATCH');
  return value;
}

export function claimOperationsActivationReceiptRoot(root, approval, {
  processId = process.pid, checkedAt = new Date().toISOString(), claimId = randomUUID()
} = {}) {
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('RECEIPT_ROOT_MISSING');
  if (!ID_PATTERN.test(approval?.runId ?? '') || !SHA_PATTERN.test(approval?.releaseSha ?? '')
    || !Number.isInteger(processId) || processId < 1 || !validDate(checkedAt) || !ID_PATTERN.test(claimId ?? '')) {
    throw new Error('OPERATIONS_ACTIVATION_RECEIPT_ROOT_CLAIM_INPUT_INVALID');
  }
  const runIdSha256 = createHash('sha256').update(approval.runId, 'utf8').digest('hex');
  const approvalSha256 = operationsActivationApprovalSha256(approval); const releaseSha = approval.releaseSha;
  const claimPath = path.join(root, RECEIPT_ROOT_CLAIM_NAME);
  const readExisting = () => {
    let value;
    try { value = JSON.parse(fs.readFileSync(claimPath, 'utf8')); } catch { throw new Error('OPERATIONS_ACTIVATION_RECEIPT_ROOT_CLAIM_INVALID'); }
    validateReceiptRootClaim(value, { runIdSha256, releaseSha, approvalSha256 });
    return { path: claimPath, runIdSha256, releaseSha, approvalSha256, created: false };
  };
  if (fs.existsSync(claimPath)) return readExisting();
  const document = { schemaVersion: 2, runIdSha256, releaseSha, approvalSha256, claimedAt: checkedAt, secretValuesRecorded: false };
  try {
    writeJsonNoReplace(claimPath, document, { processId, temporaryId: claimId });
    return { path: claimPath, runIdSha256, releaseSha, approvalSha256, created: true };
  } catch (error) {
    if (error?.message === 'NO_REPLACE_TARGET_EXISTS') return readExisting();
    throw error;
  }
}

export function evaluateOperationsActivationGate({
  p6EvidenceComplete = false, p7InProgress = false, productionGo = false,
  p6EvidencePresent = false, approvalPresent = false, approvalReceiptPresent = false, receiptRootPresent = false,
  execute = false, confirmed = false
} = {}) {
  if (!p6EvidenceComplete) return waiting('READY_WAIT_P6_ACTUAL_CUTOVER');
  if (!p7InProgress) return waiting('READY_WAIT_P7_ACTIVATION');
  if (!productionGo) return waiting('READY_WAIT_PRODUCTION_GO');
  const missing = [];
  if (!p6EvidencePresent) missing.push('p6CutoverEvidence');
  if (!approvalPresent) missing.push('activationApproval');
  if (!approvalReceiptPresent) missing.push('activationApprovalReceipt');
  if (!receiptRootPresent) missing.push('receiptRoot');
  if (missing.length) return waiting('READY_WAIT_OPERATIONS_ACTIVATION_INPUTS', missing);
  if (!execute) return waiting('PASS_OPERATIONS_ACTIVATION_DRY_RUN_READY');
  if (!confirmed) return waiting('READY_WAIT_OPERATIONS_ACTIVATION_CONFIRMATION');
  return { status: 'READY_EXECUTE_NEXT_OPERATIONS_ACTIVATION_STEP', missing, childProcessAllowed: true, approvalReadAllowed: true, receiptWriteAllowed: true };
}

export function validateOperationsActivationApprovalReceipt(value, {
  p6Document, p6EvidenceSha256, activationBundleSha256, checkedAt = new Date().toISOString()
} = {}) {
  const failures = []; const p6Approval = p6Document?.approvals?.operations ?? {};
  const p6ApprovalMatch = P6_OPERATIONS_APPROVAL_EVIDENCE_PATTERN.exec(p6Approval?.evidence ?? '');
  if (value?.schemaVersion !== 1 || value?.template !== false) failures.push('contract');
  if (value?.environment !== 'production' || value?.activationState !== 'actual') failures.push('provenance');
  if (value?.evidenceType !== OPERATIONS_ACTIVATION_APPROVAL_RECEIPT_TYPE || value?.targetUrl !== 'https://inventory.safe-link.co.kr') failures.push('typeTarget');
  if (value?.decision !== 'APPROVED' || value?.role !== 'OPERATIONS_OWNER') failures.push('decisionRole');
  if (!IDENTITY_PATTERN.test(value?.signedByRef ?? '') || value?.signedByRef !== p6Approval?.signedBy) failures.push('signedByRef');
  if (!validDate(value?.signedAt) || !validDate(checkedAt) || !validDate(p6Approval?.signedAt)) failures.push('dates');
  const signedMs = Date.parse(value?.signedAt); const checkedMs = Date.parse(checkedAt); const p6SignedMs = Date.parse(p6Approval?.signedAt);
  if (Number.isFinite(signedMs) && Number.isFinite(checkedMs) && Number.isFinite(p6SignedMs)
    && (signedMs > checkedMs || signedMs < p6SignedMs)) failures.push('approvalTimeline');
  if (!ID_PATTERN.test(value?.receiptId ?? '') || !ID_PATTERN.test(value?.runId ?? '')) failures.push('identifiers');
  if (!SHA_PATTERN.test(value?.releaseSha ?? '') || value?.releaseSha !== p6Document?.releaseSha) failures.push('releaseSha');
  if (!DIGEST_PATTERN.test(activationBundleSha256 ?? '') || value?.activationBundleSha256 !== activationBundleSha256) failures.push('activationBundleSha256');
  if (!DIGEST_PATTERN.test(p6EvidenceSha256 ?? '') || value?.p6CutoverEvidenceSha256 !== p6EvidenceSha256) failures.push('p6CutoverEvidenceSha256');
  if (p6Approval?.status !== 'APPROVED' || !p6ApprovalMatch
    || value?.p6OperationsApprovalSha256 !== p6ApprovalMatch?.[1]) failures.push('p6OperationsApprovalSha256');
  if (JSON.stringify(value?.allowedSteps) !== JSON.stringify(OPERATIONS_ACTIVATION_STEPS.map((step) => step.id))) failures.push('allowedSteps');
  if (JSON.stringify(value?.authorizedActions) !== JSON.stringify(OPERATIONS_ACTIVATION_ACTIONS)) failures.push('authorizedActions');
  if (value?.mfaVerified !== true) failures.push('mfaVerified');
  if (value?.blockingExceptionCount !== 0) failures.push('blockingExceptionCount');
  if (failures.length) throw new Error(`OPERATIONS_ACTIVATION_APPROVAL_RECEIPT_INVALID:${[...new Set(failures)].join(',')}`);
  return value;
}

export function validateOperationsActivationApproval(value, {
  p6Document, p6EvidenceSha256, activationBundleSha256, approvalReceipt, approvalReceiptSha256,
  checkedAt = new Date().toISOString()
} = {}) {
  const failures = [];
  if (value?.schemaVersion !== 1 || value?.template !== false) failures.push('contract');
  if (value?.environment !== 'production' || value?.activationState !== 'actual' || value?.approved !== true) failures.push('provenance');
  if (value?.targetUrl !== 'https://inventory.safe-link.co.kr') failures.push('targetUrl');
  if (!ID_PATTERN.test(value?.runId ?? '')) failures.push('runId');
  if (!SHA_PATTERN.test(value?.releaseSha ?? '') || value?.releaseSha !== p6Document?.releaseSha) failures.push('releaseSha');
  if (!DIGEST_PATTERN.test(activationBundleSha256 ?? '') || value?.activationBundleSha256 !== activationBundleSha256) failures.push('activationBundleSha256');
  if (!DIGEST_PATTERN.test(p6EvidenceSha256 ?? '') || value?.p6CutoverEvidenceSha256 !== p6EvidenceSha256) failures.push('p6CutoverEvidenceSha256');
  const p6OperationsApprovalSha256 = P6_OPERATIONS_APPROVAL_EVIDENCE_PATTERN.exec(p6Document?.approvals?.operations?.evidence ?? '')?.[1];
  if (!DIGEST_PATTERN.test(p6OperationsApprovalSha256 ?? '') || value?.p6OperationsApprovalSha256 !== p6OperationsApprovalSha256) failures.push('p6OperationsApprovalSha256');
  if (!DIGEST_PATTERN.test(approvalReceiptSha256 ?? '') || value?.approvalReceiptSha256 !== approvalReceiptSha256) failures.push('approvalReceiptSha256');
  if (!IDENTITY_PATTERN.test(value?.authorizedByRef ?? '')) failures.push('authorizedByRef');
  if (!validDate(value?.approvedAt) || !validDate(value?.expiresAt) || !validDate(checkedAt)) failures.push('dates');
  const checkedMs = Date.parse(checkedAt); const approvedMs = Date.parse(value?.approvedAt); const expiresMs = Date.parse(value?.expiresAt);
  if (Number.isFinite(checkedMs) && Number.isFinite(approvedMs) && Number.isFinite(expiresMs)
    && (approvedMs > checkedMs || expiresMs <= checkedMs || expiresMs - approvedMs > 45 * 86400000)) failures.push('approvalWindow');
  if (JSON.stringify(value?.allowedSteps) !== JSON.stringify(OPERATIONS_ACTIVATION_STEPS.map((step) => step.id))) failures.push('allowedSteps');
  if (JSON.stringify(value?.authorizedActions) !== JSON.stringify(OPERATIONS_ACTIVATION_ACTIONS)) failures.push('authorizedActions');
  try { validateOperationsActivationApprovalReceipt(approvalReceipt, { p6Document, p6EvidenceSha256, activationBundleSha256, checkedAt }); }
  catch { failures.push('approvalReceipt'); }
  if (value?.authorizedByRef !== approvalReceipt?.signedByRef || value?.approvedAt !== approvalReceipt?.signedAt
    || value?.runId !== approvalReceipt?.runId || value?.releaseSha !== approvalReceipt?.releaseSha
    || value?.activationBundleSha256 !== approvalReceipt?.activationBundleSha256
    || value?.p6CutoverEvidenceSha256 !== approvalReceipt?.p6CutoverEvidenceSha256
    || value?.p6OperationsApprovalSha256 !== approvalReceipt?.p6OperationsApprovalSha256
    || JSON.stringify(value?.allowedSteps) !== JSON.stringify(approvalReceipt?.allowedSteps)
    || JSON.stringify(value?.authorizedActions) !== JSON.stringify(approvalReceipt?.authorizedActions)) failures.push('approvalReceiptContent');
  if (p6Document?.schemaVersion !== 1 || p6Document?.environment !== 'production' || p6Document?.activationState !== 'actual'
    || p6Document?.evidenceType !== 'P6_CUTOVER_ACTUAL' || p6Document?.status !== 'PASS'
    || p6Document?.productionGo !== true || p6Document?.targetUrl !== value?.targetUrl) failures.push('p6Evidence');
  if (failures.length) throw new Error(`OPERATIONS_ACTIVATION_APPROVAL_INVALID:${[...new Set(failures)].join(',')}`);
  return value;
}

export function classifyOperationsActivationStep(step, { exitCode = 0, summary = null } = {}) {
  const status = summary?.status;
  if (exitCode !== 0 || typeof status !== 'string' || status.startsWith('FAIL_') || status.startsWith('BLOCKED_')) return 'FAIL';
  if (step.pass.includes(status)) return 'PASS';
  if (status.startsWith('READY_')) return 'WAIT';
  if (step.id === 'slo-collect' && status.startsWith('PASS_SLO_SAMPLE_')) return 'WAIT';
  return 'FAIL';
}

export function selectNextOperationsActivationStep(receipts = [], { approval = null } = {}) {
  const failures = [];
  const expectedApprovalSha256 = approval ? operationsActivationApprovalSha256(approval) : null;
  for (const receipt of receipts) {
    const stepIndex = OPERATIONS_ACTIVATION_STEPS.findIndex((item) => item.id === receipt?.stepId);
    const step = OPERATIONS_ACTIVATION_STEPS[stepIndex];
    if (!step || receipt?.schemaVersion !== 2 || !ID_PATTERN.test(receipt?.runId ?? '')
      || receipt?.environment !== 'production' || receipt?.activationState !== 'actual'
      || !SHA_PATTERN.test(receipt?.releaseSha ?? '') || !DIGEST_PATTERN.test(receipt?.approvalSha256 ?? '')
      || receipt?.sequence !== stepIndex + 1 || !Number.isInteger(receipt?.attempt) || receipt.attempt < 1 || receipt.attempt > 9999
      || !['PASS', 'WAIT', 'FAIL'].includes(receipt?.outcome) || typeof receipt?.status !== 'string'
      || !Number.isInteger(receipt?.exitCode) || !validDate(receipt?.checkedAt)
      || receipt?.command?.executable !== 'node' || receipt?.command?.script !== step?.script
      || JSON.stringify(receipt?.command?.args) !== JSON.stringify(step?.args)
      || !DIGEST_PATTERN.test(receipt?.stdoutSha256 ?? '') || !DIGEST_PATTERN.test(receipt?.stderrSha256 ?? '')
      || receipt?.secretValuesRecorded !== false
      || (step && classifyOperationsActivationStep(step, { exitCode: receipt?.exitCode, summary: { status: receipt?.status } }) !== receipt?.outcome)) failures.push('receiptContract');
  }
  if (new Set(receipts.map((receipt) => receipt.runId)).size > 1) failures.push('receiptRunId');
  if (new Set(receipts.map((receipt) => receipt.releaseSha)).size > 1) failures.push('receiptReleaseSha');
  if (new Set(receipts.map((receipt) => receipt.approvalSha256)).size > 1) failures.push('receiptApprovalSha256');
  if (approval && receipts.some((receipt) => receipt.runId !== approval.runId || receipt.releaseSha !== approval.releaseSha
    || receipt.approvalSha256 !== expectedApprovalSha256)) failures.push('receiptApprovalProvenance');
  let earlierStepsPassed = true;
  for (const step of OPERATIONS_ACTIVATION_STEPS) {
    const stepReceipts = receipts.filter((receipt) => receipt.stepId === step.id).sort((left, right) => left.attempt - right.attempt);
    if (stepReceipts.length && !earlierStepsPassed) failures.push('receiptOrder');
    if (stepReceipts.some((receipt, index) => receipt.attempt !== index + 1)) failures.push('receiptAttemptSequence');
    const passIndexes = stepReceipts.map((receipt, index) => receipt.outcome === 'PASS' ? index : -1).filter((index) => index >= 0);
    if (passIndexes.length > 1 || (passIndexes.length === 1 && passIndexes[0] !== stepReceipts.length - 1)) failures.push('receiptTerminalPass');
    if (stepReceipts.filter((receipt) => receipt.outcome === 'FAIL').length > 3) failures.push('receiptFailureLimit');
    earlierStepsPassed = earlierStepsPassed && passIndexes.length === 1;
  }
  if (failures.length) throw new Error('OPERATIONS_ACTIVATION_RECEIPT_INVALID');
  for (const step of OPERATIONS_ACTIVATION_STEPS) {
    const stepReceipts = receipts.filter((receipt) => receipt.stepId === step.id);
    if (stepReceipts.some((receipt) => receipt.outcome === 'PASS')) continue;
    const failedAttempts = stepReceipts.filter((receipt) => receipt.outcome === 'FAIL').length;
    if (failedAttempts >= 3) return { status: 'PAUSED_OPERATIONS_ACTIVATION_STEP_FAILED_THREE_TIMES', step, attempt: stepReceipts.length + 1, failedAttempts };
    if (stepReceipts.length >= 9999) return { status: 'PAUSED_OPERATIONS_ACTIVATION_ATTEMPT_LIMIT', step, attempt: 10000, failedAttempts };
    return { status: 'READY_NEXT_OPERATIONS_ACTIVATION_STEP', step, attempt: stepReceipts.length + 1, failedAttempts };
  }
  return { status: 'PASS_OPERATIONS_ACTIVATION_SEQUENCE_COMPLETE', step: null, attempt: 0, failedAttempts: 0 };
}

export function buildOperationsActivationReceipt({ approval, step, attempt, result, checkedAt = new Date().toISOString() } = {}) {
  const outcome = classifyOperationsActivationStep(step, result);
  return {
    schemaVersion: 2, environment: 'production', activationState: 'actual',
    runId: approval.runId, releaseSha: approval.releaseSha, approvalSha256: operationsActivationApprovalSha256(approval),
    stepId: step.id, sequence: OPERATIONS_ACTIVATION_STEPS.indexOf(step) + 1,
    attempt, outcome, status: result.summary?.status ?? 'MISSING_STATUS', exitCode: result.exitCode,
    checkedAt, command: { executable: 'node', script: step.script, args: [...step.args] },
    stdoutSha256: createHash('sha256').update(result.stdout ?? '').digest('hex'),
    stderrSha256: createHash('sha256').update(result.stderr ?? '').digest('hex'),
    secretValuesRecorded: false
  };
}

export function writeOperationsActivationReceiptOnce(root, receipt, { processId = process.pid } = {}) {
  if (!root || !fs.existsSync(root)) throw new Error('RECEIPT_ROOT_MISSING');
  if (!Number.isInteger(receipt?.attempt) || receipt.attempt < 1 || receipt.attempt > 9999) throw new Error('RECEIPT_ATTEMPT_INVALID');
  const name = `${String(receipt.sequence).padStart(2, '0')}-${receipt.stepId}-attempt-${String(receipt.attempt).padStart(4, '0')}.json`;
  const output = path.join(root, name);
  if (fs.existsSync(output)) throw new Error('RECEIPT_ALREADY_EXISTS');
  try { writeJsonNoReplace(output, receipt, { processId }); }
  catch (error) { if (error?.message === 'NO_REPLACE_TARGET_EXISTS') throw new Error('RECEIPT_ALREADY_EXISTS'); throw error; }
  return output;
}

export function acquireOperationsActivationLease(root, approval, {
  processId = process.pid, checkedAt = new Date().toISOString(), leaseId = randomUUID()
} = {}) {
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('RECEIPT_ROOT_MISSING');
  if (!ID_PATTERN.test(approval?.runId ?? '') || !SHA_PATTERN.test(approval?.releaseSha ?? '') || !ID_PATTERN.test(leaseId ?? '')
    || !Number.isInteger(processId) || processId < 1 || !validDate(checkedAt)) {
    throw new Error('OPERATIONS_ACTIVATION_LEASE_INPUT_INVALID');
  }
  const runIdSha256 = createHash('sha256').update(approval.runId, 'utf8').digest('hex');
  const releaseSha = approval.releaseSha; const approvalSha256 = operationsActivationApprovalSha256(approval);
  const rootClaim = claimOperationsActivationReceiptRoot(root, approval, { processId, checkedAt, claimId: leaseId });
  const leasePath = path.join(root, `.operations-activation-${runIdSha256.slice(0, 16)}.lock`);
  const document = { schemaVersion: 2, runIdSha256, releaseSha, approvalSha256, leaseId, processId, acquiredAt: checkedAt, secretValuesRecorded: false };
  let handle = null; let created = false;
  try {
    handle = fs.openSync(leasePath, 'wx', 0o600); created = true;
    fs.writeFileSync(handle, `${JSON.stringify(document, null, 2)}\n`, 'utf8'); fs.fsyncSync(handle);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('OPERATIONS_ACTIVATION_LEASE_HELD');
    if (created && fs.existsSync(leasePath)) fs.rmSync(leasePath);
    throw error;
  } finally {
    if (handle !== null) fs.closeSync(handle);
  }
  return { path: leasePath, runIdSha256, releaseSha, approvalSha256, leaseId, processId, rootClaim };
}

export function releaseOperationsActivationLease(lease) {
  if (!lease?.path || !fs.existsSync(lease.path)) throw new Error('OPERATIONS_ACTIVATION_LEASE_MISSING');
  let document;
  try { document = JSON.parse(fs.readFileSync(lease.path, 'utf8')); } catch { throw new Error('OPERATIONS_ACTIVATION_LEASE_INVALID'); }
  if (document?.schemaVersion !== 2 || document?.runIdSha256 !== lease.runIdSha256 || document?.releaseSha !== lease.releaseSha
    || document?.approvalSha256 !== lease.approvalSha256 || document?.leaseId !== lease.leaseId
    || document?.processId !== lease.processId || document?.secretValuesRecorded !== false) {
    throw new Error('OPERATIONS_ACTIVATION_LEASE_OWNERSHIP_MISMATCH');
  }
  fs.unlinkSync(lease.path);
  return true;
}
