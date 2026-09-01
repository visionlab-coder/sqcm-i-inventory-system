import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildOperationsActivationApprovalRequest,
  writeOperationsActivationApprovalRequestOnce
} from './operations-activation-approval-request.mjs';
import {
  buildOperationsActivationApprovalManifest,
  writeOperationsActivationApprovalManifestOnce
} from './operations-activation-approval-manifest.mjs';
import { verifyOperationsActivationApprovalChain } from './operations-activation-approval-chain-preflight.mjs';
import { OPERATIONS_ACTIVATION_ACTIONS, OPERATIONS_ACTIVATION_STEPS } from './operations-activation-orchestrator.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function writeJsonOnce(filePath, value) {
  const handle = fs.openSync(filePath, 'wx', 0o600);
  try { fs.writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
}
function readDocument(filePath) {
  const raw = fs.readFileSync(filePath); return { raw, value: JSON.parse(raw.toString('utf8')), sha256: sha256(raw) };
}

export function runOperationsActivationApprovalPipelineRehearsal({
  activationBundleSha256, temporaryBase = os.tmpdir()
} = {}) {
  if (!SHA256_PATTERN.test(activationBundleSha256 ?? '')) throw new Error('ACTIVATION_BUNDLE_SHA256_INVALID');
  const base = path.resolve(temporaryBase); const stat = fs.lstatSync(base);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)
    || path.resolve(fs.realpathSync(base)).toLowerCase() !== base.toLowerCase()) throw new Error('TEMPORARY_BASE_NOT_PHYSICAL');
  const root = fs.mkdtempSync(path.join(base, 'sqcmi-p7-approval-pipeline-'));
  const relativeRoot = path.relative(base, root);
  if (!relativeRoot || relativeRoot.startsWith('..') || path.isAbsolute(relativeRoot)) throw new Error('TEMPORARY_ROOT_OUTSIDE_BASE');
  let result;
  try {
    const repositoryRoot = path.join(root, 'repository');
    const paths = {
      p6: path.join(root, 'p6-cutover.json'), request: path.join(root, 'approval-request.json'),
      receipt: path.join(root, 'approval-receipt.json'), manifest: path.join(root, 'approval-manifest.json')
    };
    const p6 = {
      schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
      evidenceType: 'P6_CUTOVER_ACTUAL', domain: 'p6-cutover', status: 'PASS', productionGo: true,
      targetUrl: 'https://inventory.safe-link.co.kr', runId: 'synthetic-p6-cutover-20260912-001', releaseSha: 'a'.repeat(40),
      approvals: { operations: { status: 'APPROVED', signedBy: 'identity://synthetic-operations-owner', signedAt: '2026-09-11T12:30:00.000Z', evidence: `production operations approval sha256:${'e'.repeat(64)}` } }
    };
    writeJsonOnce(paths.p6, p6); const p6File = readDocument(paths.p6);
    const request = buildOperationsActivationApprovalRequest({
      p6Document: p6File.value, p6EvidenceSha256: p6File.sha256,
      activationBundleSha256, requestedAt: '2026-09-12T00:00:00.000Z'
    });
    writeOperationsActivationApprovalRequestOnce(paths.request, request, { repositoryRoot, processId: 931 });
    const requestFile = readDocument(paths.request);
    const receipt = {
      schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
      evidenceType: 'P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT', targetUrl: p6.targetUrl,
      decision: 'APPROVED', role: 'OPERATIONS_OWNER', signedByRef: p6.approvals.operations.signedBy,
      signedAt: '2026-09-12T01:00:00.000Z', receiptId: 'synthetic-p7-approval-receipt-20260912-001',
      runId: request.runId, releaseSha: p6.releaseSha, activationBundleSha256,
      p6CutoverEvidenceSha256: p6File.sha256, p6OperationsApprovalSha256: 'e'.repeat(64),
      allowedSteps: OPERATIONS_ACTIVATION_STEPS.map((step) => step.id),
      authorizedActions: [...OPERATIONS_ACTIVATION_ACTIONS], mfaVerified: true, blockingExceptionCount: 0
    };
    writeJsonOnce(paths.receipt, receipt); const receiptFile = readDocument(paths.receipt);
    const manifest = buildOperationsActivationApprovalManifest({
      requestDocument: requestFile.value, approvalReceipt: receiptFile.value,
      approvalReceiptSha256: receiptFile.sha256, p6Document: p6File.value,
      p6EvidenceSha256: p6File.sha256, activationBundleSha256,
      checkedAt: '2026-09-12T02:00:00.000Z'
    });
    writeOperationsActivationApprovalManifestOnce(paths.manifest, manifest, { repositoryRoot, processId: 932 });
    const manifestFile = readDocument(paths.manifest);
    const verify = (overrides = {}) => verifyOperationsActivationApprovalChain({
      p6: p6File.value, request: requestFile.value, receipt: receiptFile.value, manifest: manifestFile.value,
      p6EvidenceSha256: p6File.sha256, approvalRequestSha256: requestFile.sha256,
      approvalReceiptSha256: receiptFile.sha256, approvalManifestSha256: manifestFile.sha256,
      activationBundleSha256, checkedAt: '2026-09-12T02:00:00.000Z', ...overrides
    });
    const preflight = verify();
    const tamperScenarios = [
      { request: { ...requestFile.value, requestedToRef: 'identity://synthetic-other-owner' } },
      { receipt: { ...receiptFile.value, activationBundleSha256: '8'.repeat(64) } },
      { manifest: { ...manifestFile.value, expiresAt: '2026-10-26T01:00:00.000Z' } }
    ];
    let tamperRejectedCount = 0;
    for (const scenario of tamperScenarios) {
      try { verify(scenario); } catch { tamperRejectedCount += 1; }
    }
    if (tamperRejectedCount !== tamperScenarios.length) throw new Error('TAMPER_SCENARIO_NOT_REJECTED');
    result = {
      status: 'PASS_SYNTHETIC_OPERATIONS_ACTIVATION_APPROVAL_PIPELINE_REHEARSAL',
      stageCount: 4, physicalDocumentCount: 4,
      verifiedDocumentCount: preflight.verifiedDocumentCount,
      tamperScenarioCount: tamperScenarios.length, tamperRejectedCount,
      activationBundleSha256, syntheticOnly: true,
      actualApprovalCreated: false, actualActivationExecuted: false,
      externalMutationPerformed: false, secretValuesReadOrRecorded: false
    };
  } finally {
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  }
  result.temporaryArtifactsRetained = fs.existsSync(root);
  return result;
}
