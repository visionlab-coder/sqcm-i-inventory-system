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
import {
  OPERATIONS_ACTIVATION_ACTIONS,
  OPERATIONS_ACTIVATION_STEPS,
  buildOperationsActivationChildEnvironment,
  buildOperationsActivationReceipt,
  claimOperationsActivationReceiptRoot,
  selectNextOperationsActivationStep,
  validateOperationsActivationApproval,
  writeOperationsActivationReceiptOnce
} from './operations-activation-orchestrator.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function writeJsonOnce(filePath, value) {
  const handle = fs.openSync(filePath, 'wx', 0o600);
  try { fs.writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.fsyncSync(handle); }
  finally { fs.closeSync(handle); }
}
function readDocument(filePath) {
  const raw = fs.readFileSync(filePath);
  return { value: JSON.parse(raw.toString('utf8')), sha256: sha256(raw) };
}
function physicalTemporaryBase(temporaryBase) {
  const base = path.resolve(temporaryBase); const stat = fs.lstatSync(base);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)
    || path.resolve(fs.realpathSync(base)).toLowerCase() !== base.toLowerCase()) throw new Error('TEMPORARY_BASE_NOT_PHYSICAL');
  return base;
}
function countPhysicalFiles(root) {
  let count = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)) throw new Error('TEMPORARY_ARTIFACT_NOT_PHYSICAL');
    if (entry.isDirectory()) count += countPhysicalFiles(candidate);
    else if (entry.isFile()) count += 1;
    else throw new Error('TEMPORARY_ARTIFACT_TYPE_INVALID');
  }
  return count;
}

function runRehearsal({
  activationBundleSha256, temporaryBase = os.tmpdir(), completeSequence = false, waitBeforePass = false,
  releaseSha = 'a'.repeat(40), targetUrl = 'https://inventory.safe-link.co.kr'
} = {}) {
  if (!SHA256_PATTERN.test(activationBundleSha256 ?? '')) throw new Error('ACTIVATION_BUNDLE_SHA256_INVALID');
  if (!/^[a-f0-9]{40}$/.test(releaseSha ?? '')) throw new Error('RELEASE_SHA_INVALID');
  if (targetUrl !== 'https://inventory.safe-link.co.kr') throw new Error('TARGET_URL_INVALID');
  const base = physicalTemporaryBase(temporaryBase);
  const root = fs.mkdtempSync(path.join(base, 'sqcmi-p7-approval-orchestrator-'));
  const relativeRoot = path.relative(base, root);
  if (!relativeRoot || relativeRoot.startsWith('..') || path.isAbsolute(relativeRoot)) throw new Error('TEMPORARY_ROOT_OUTSIDE_BASE');
  let result;
  try {
    const repositoryRoot = path.join(root, 'repository');
    const receiptRoot = path.join(root, 'activation-receipts');
    fs.mkdirSync(receiptRoot);
    const paths = {
      p6: path.join(root, 'p6-cutover.json'), request: path.join(root, 'approval-request.json'),
      receipt: path.join(root, 'approval-receipt.json'), manifest: path.join(root, 'approval-manifest.json')
    };
    const p6 = {
      schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
      evidenceType: 'P6_CUTOVER_ACTUAL', domain: 'p6-cutover', status: 'PASS', productionGo: true,
      targetUrl, runId: 'synthetic-p6-cutover-20260912-002', releaseSha,
      approvals: { operations: { status: 'APPROVED', signedBy: 'identity://synthetic-operations-owner', signedAt: '2026-09-11T12:30:00.000Z', evidence: `production operations approval sha256:${'e'.repeat(64)}` } }
    };
    writeJsonOnce(paths.p6, p6); const p6File = readDocument(paths.p6);
    const request = buildOperationsActivationApprovalRequest({
      p6Document: p6File.value, p6EvidenceSha256: p6File.sha256,
      activationBundleSha256, requestedAt: '2026-09-12T00:00:00.000Z'
    });
    writeOperationsActivationApprovalRequestOnce(paths.request, request, { repositoryRoot, processId: 941 });
    const requestFile = readDocument(paths.request);
    const receipt = {
      schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
      evidenceType: 'P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT', targetUrl: p6.targetUrl,
      decision: 'APPROVED', role: 'OPERATIONS_OWNER', signedByRef: p6.approvals.operations.signedBy,
      signedAt: '2026-09-12T01:00:00.000Z', receiptId: 'synthetic-p7-approval-receipt-20260912-002',
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
    writeOperationsActivationApprovalManifestOnce(paths.manifest, manifest, { repositoryRoot, processId: 942 });
    const manifestFile = readDocument(paths.manifest);
    const preflight = verifyOperationsActivationApprovalChain({
      p6: p6File.value, request: requestFile.value, receipt: receiptFile.value, manifest: manifestFile.value,
      p6EvidenceSha256: p6File.sha256, approvalRequestSha256: requestFile.sha256,
      approvalReceiptSha256: receiptFile.sha256, approvalManifestSha256: manifestFile.sha256,
      activationBundleSha256, checkedAt: '2026-09-12T02:00:00.000Z'
    });
    const approval = validateOperationsActivationApproval(manifestFile.value, {
      p6Document: p6File.value, p6EvidenceSha256: p6File.sha256, activationBundleSha256,
      approvalReceipt: receiptFile.value, approvalReceiptSha256: receiptFile.sha256,
      checkedAt: '2026-09-12T02:00:00.000Z'
    });
    const rootClaim = claimOperationsActivationReceiptRoot(receiptRoot, approval, {
      processId: 943, checkedAt: '2026-09-12T02:01:00.000Z', claimId: 'synthetic-root-claim-0001'
    });
    let selection = selectNextOperationsActivationStep([], { approval });
    const firstSelectedStep = selection.step?.id ?? null;
    const activationReceipts = [];
    const stepLimit = completeSequence ? OPERATIONS_ACTIVATION_STEPS.length : 1;
    let receiptOrdinal = 0; let waitReceiptCount = 0; let passReceiptCount = 0; let resumeVerificationCount = 0;
    const persistReceipt = (step, attempt, status) => {
      const activationReceipt = buildOperationsActivationReceipt({
        approval, step, attempt,
        result: { exitCode: 0, summary: { status }, stdout: `synthetic stdout ${step.id} attempt ${attempt}`, stderr: '' },
        checkedAt: new Date(Date.parse('2026-09-12T02:02:00.000Z') + receiptOrdinal * 60000).toISOString()
      });
      writeOperationsActivationReceiptOnce(receiptRoot, activationReceipt, { processId: 944 + receiptOrdinal });
      const receiptName = `${String(activationReceipt.sequence).padStart(2, '0')}-${activationReceipt.stepId}-attempt-${String(attempt).padStart(4, '0')}.json`;
      activationReceipts.push(readDocument(path.join(receiptRoot, receiptName)).value);
      receiptOrdinal += 1;
      return selectNextOperationsActivationStep(activationReceipts, { approval });
    };
    for (let index = 0; index < stepLimit; index += 1) {
      if (!selection.step) throw new Error('ACTIVATION_SEQUENCE_ENDED_EARLY');
      const childEnvironment = buildOperationsActivationChildEnvironment(selection.step, {
        PATH: process.env.PATH ?? '', P7_SLO_LEDGER_FILE: path.join(root, 'synthetic-ledger.json'),
        UNRELATED_SECRET: 'must-not-propagate', GITHUB_TOKEN: 'must-not-propagate', NODE_OPTIONS: '--require malicious'
      });
      if ('UNRELATED_SECRET' in childEnvironment || 'GITHUB_TOKEN' in childEnvironment || 'NODE_OPTIONS' in childEnvironment) {
        throw new Error('UNRELATED_CHILD_ENVIRONMENT_PROPAGATED');
      }
      const step = selection.step;
      if (waitBeforePass) {
        selection = persistReceipt(step, 1, 'READY_WAIT_SYNTHETIC_OPERATION_INPUT'); waitReceiptCount += 1;
        if (selection.step?.id !== step.id || selection.attempt !== 2) throw new Error('ACTIVATION_WAIT_RESUME_SELECTION_INVALID');
        resumeVerificationCount += 1;
      }
      selection = persistReceipt(step, waitBeforePass ? 2 : 1, step.pass[0]); passReceiptCount += 1;
    }

    const tamperScenarios = waitBeforePass ? [
      activationReceipts.slice(1),
      [...activationReceipts, {
        ...activationReceipts[1], attempt: 3, outcome: 'WAIT', status: 'READY_WAIT_SYNTHETIC_OPERATION_INPUT',
        checkedAt: '2026-09-12T03:00:00.000Z'
      }],
      activationReceipts.map((item, index) => index === 10 ? { ...item, runId: 'p7-activation-synthetic-other-run' } : item)
    ] : completeSequence ? [
      activationReceipts.map((item, index) => index === 0 ? { ...item, sequence: 2 } : item),
      activationReceipts.map((item, index) => index === 5 ? { ...item, approvalSha256: '9'.repeat(64) } : item),
      activationReceipts.slice(0, -1)
    ] : [
      { manifest: { ...manifestFile.value, approvalReceiptSha256: '9'.repeat(64) }, receipt: receiptFile.value, bundle: activationBundleSha256 },
      { manifest: manifestFile.value, receipt: { ...receiptFile.value, signedByRef: 'identity://synthetic-other-owner' }, bundle: activationBundleSha256 },
      { manifest: manifestFile.value, receipt: receiptFile.value, bundle: '8'.repeat(64) }
    ];
    let tamperRejectedCount = 0;
    for (const scenario of tamperScenarios) {
      try {
        if (completeSequence) {
          const tamperedSelection = selectNextOperationsActivationStep(scenario, { approval });
          if (tamperedSelection.status !== 'PASS_OPERATIONS_ACTIVATION_SEQUENCE_COMPLETE') tamperRejectedCount += 1;
        } else {
          validateOperationsActivationApproval(scenario.manifest, {
            p6Document: p6File.value, p6EvidenceSha256: p6File.sha256, activationBundleSha256: scenario.bundle,
            approvalReceipt: scenario.receipt, approvalReceiptSha256: receiptFile.sha256,
            checkedAt: '2026-09-12T02:00:00.000Z'
          });
        }
      } catch { tamperRejectedCount += 1; }
    }
    if (tamperRejectedCount !== tamperScenarios.length) throw new Error('TAMPER_SCENARIO_NOT_REJECTED');
    result = {
      status: waitBeforePass
        ? 'PASS_SYNTHETIC_OPERATIONS_ACTIVATION_WAIT_RESUME_SEQUENCE_REHEARSAL'
        : completeSequence
        ? 'PASS_SYNTHETIC_OPERATIONS_ACTIVATION_FULL_SEQUENCE_REHEARSAL'
        : 'PASS_SYNTHETIC_OPERATIONS_ACTIVATION_APPROVAL_TO_ORCHESTRATOR_REHEARSAL',
      approvalChainVerified: preflight.status === 'PASS_OPERATIONS_ACTIVATION_APPROVAL_CHAIN_PREFLIGHT',
      orchestratorApprovalVerified: approval === manifestFile.value,
      receiptRootClaimCreated: rootClaim.created,
      firstSelectedStep,
      nextSelectedStep: selection.step?.id ?? null,
      finalSelectionStatus: selection.status,
      sequenceComplete: selection.status === 'PASS_OPERATIONS_ACTIVATION_SEQUENCE_COMPLETE',
      activationStepCount: passReceiptCount,
      activationReceiptCount: activationReceipts.length,
      waitReceiptCount, passReceiptCount, resumeVerificationCount,
      physicalDocumentCount: countPhysicalFiles(root),
      tamperScenarioCount: tamperScenarios.length, tamperRejectedCount,
      childProcessCount: 0, syntheticOnly: true,
      releaseSha, targetUrl,
      actualApprovalCreated: false, actualActivationExecuted: false,
      externalMutationPerformed: false, secretValuesReadOrRecorded: false,
      productionGo: false
    };
  } finally {
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  }
  result.temporaryArtifactsRetained = fs.existsSync(root);
  return result;
}

export function runOperationsActivationApprovalToOrchestratorRehearsal(options = {}) {
  return runRehearsal({ ...options, completeSequence: false, waitBeforePass: false });
}

export function runOperationsActivationFullSequenceRehearsal(options = {}) {
  return runRehearsal({ ...options, completeSequence: true, waitBeforePass: false });
}

export function runOperationsActivationWaitResumeSequenceRehearsal(options = {}) {
  return runRehearsal({ ...options, completeSequence: true, waitBeforePass: true });
}

export function runOperationsActivationThreeFailureMatrixRehearsal({
  activationBundleSha256, temporaryBase = os.tmpdir()
} = {}) {
  if (!SHA256_PATTERN.test(activationBundleSha256 ?? '')) throw new Error('ACTIVATION_BUNDLE_SHA256_INVALID');
  const base = physicalTemporaryBase(temporaryBase);
  const root = fs.mkdtempSync(path.join(base, 'sqcmi-p7-three-failure-matrix-'));
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
      targetUrl: 'https://inventory.safe-link.co.kr', runId: 'synthetic-p6-cutover-three-failure-matrix',
      releaseSha: 'a'.repeat(40),
      approvals: { operations: { status: 'APPROVED', signedBy: 'identity://synthetic-operations-owner', signedAt: '2026-09-11T12:30:00.000Z', evidence: `production operations approval sha256:${'e'.repeat(64)}` } }
    };
    writeJsonOnce(paths.p6, p6); const p6File = readDocument(paths.p6);
    const request = buildOperationsActivationApprovalRequest({
      p6Document: p6File.value, p6EvidenceSha256: p6File.sha256,
      activationBundleSha256, requestedAt: '2026-09-12T00:00:00.000Z'
    });
    writeOperationsActivationApprovalRequestOnce(paths.request, request, { repositoryRoot, processId: 1941 });
    const requestFile = readDocument(paths.request);
    const approvalReceipt = {
      schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
      evidenceType: 'P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT', targetUrl: p6.targetUrl,
      decision: 'APPROVED', role: 'OPERATIONS_OWNER', signedByRef: p6.approvals.operations.signedBy,
      signedAt: '2026-09-12T01:00:00.000Z', receiptId: 'synthetic-p7-three-failure-matrix-receipt',
      runId: request.runId, releaseSha: p6.releaseSha, activationBundleSha256,
      p6CutoverEvidenceSha256: p6File.sha256, p6OperationsApprovalSha256: 'e'.repeat(64),
      allowedSteps: OPERATIONS_ACTIVATION_STEPS.map((step) => step.id),
      authorizedActions: [...OPERATIONS_ACTIVATION_ACTIONS], mfaVerified: true, blockingExceptionCount: 0
    };
    writeJsonOnce(paths.receipt, approvalReceipt); const receiptFile = readDocument(paths.receipt);
    const manifest = buildOperationsActivationApprovalManifest({
      requestDocument: requestFile.value, approvalReceipt: receiptFile.value,
      approvalReceiptSha256: receiptFile.sha256, p6Document: p6File.value,
      p6EvidenceSha256: p6File.sha256, activationBundleSha256,
      checkedAt: '2026-09-12T02:00:00.000Z'
    });
    writeOperationsActivationApprovalManifestOnce(paths.manifest, manifest, { repositoryRoot, processId: 1942 });
    const manifestFile = readDocument(paths.manifest);
    verifyOperationsActivationApprovalChain({
      p6: p6File.value, request: requestFile.value, receipt: receiptFile.value, manifest: manifestFile.value,
      p6EvidenceSha256: p6File.sha256, approvalRequestSha256: requestFile.sha256,
      approvalReceiptSha256: receiptFile.sha256, approvalManifestSha256: manifestFile.sha256,
      activationBundleSha256, checkedAt: '2026-09-12T02:00:00.000Z'
    });
    const approval = validateOperationsActivationApproval(manifestFile.value, {
      p6Document: p6File.value, p6EvidenceSha256: p6File.sha256, activationBundleSha256,
      approvalReceipt: receiptFile.value, approvalReceiptSha256: receiptFile.sha256,
      checkedAt: '2026-09-12T02:00:00.000Z'
    });

    const scenarioResults = [];
    let totalReceiptCount = 0; let laterStepReceiptCount = 0;
    for (let targetIndex = 0; targetIndex < OPERATIONS_ACTIVATION_STEPS.length; targetIndex += 1) {
      const receiptRoot = path.join(root, `scenario-${String(targetIndex + 1).padStart(2, '0')}`);
      fs.mkdirSync(receiptRoot);
      claimOperationsActivationReceiptRoot(receiptRoot, approval, {
        processId: 2000 + targetIndex, checkedAt: '2026-09-12T02:01:00.000Z',
        claimId: `synthetic-three-failure-claim-${String(targetIndex + 1).padStart(2, '0')}`
      });
      const activationReceipts = [];
      const persist = (step, attempt, exitCode, status) => {
        const receipt = buildOperationsActivationReceipt({
          approval, step, attempt,
          result: { exitCode, summary: { status }, stdout: '', stderr: 'synthetic failure without secret values' },
          checkedAt: new Date(Date.parse('2026-09-12T02:02:00.000Z') + activationReceipts.length * 60000).toISOString()
        });
        writeOperationsActivationReceiptOnce(receiptRoot, receipt, {
          processId: 3000 + targetIndex * 32 + activationReceipts.length
        });
        activationReceipts.push(receipt);
      };
      for (let index = 0; index < targetIndex; index += 1) {
        persist(OPERATIONS_ACTIVATION_STEPS[index], 1, 0, OPERATIONS_ACTIVATION_STEPS[index].pass[0]);
      }
      const target = OPERATIONS_ACTIVATION_STEPS[targetIndex];
      for (let attempt = 1; attempt <= 3; attempt += 1) persist(target, attempt, 1, 'FAIL_SYNTHETIC_OPERATION');
      const selection = selectNextOperationsActivationStep(activationReceipts, { approval });
      laterStepReceiptCount += activationReceipts.filter((item) => item.sequence > targetIndex + 1).length;
      totalReceiptCount += activationReceipts.length;
      scenarioResults.push({ targetStepId: target.id, selection });
    }

    const firstTarget = OPERATIONS_ACTIVATION_STEPS[0];
    const buildFailure = (attempt, overrides = {}) => ({
      ...buildOperationsActivationReceipt({
        approval, step: firstTarget, attempt,
        result: { exitCode: 1, summary: { status: 'FAIL_SYNTHETIC_OPERATION' }, stdout: '', stderr: '' },
        checkedAt: new Date(Date.parse('2026-09-12T04:00:00.000Z') + attempt * 60000).toISOString()
      }),
      ...overrides
    });
    const tamperScenarios = [
      { receipts: [buildFailure(1), buildFailure(2)], reject: (selection) => selection.status !== 'PAUSED_OPERATIONS_ACTIVATION_STEP_FAILED_THREE_TIMES' },
      { receipts: [buildFailure(1), buildFailure(2), buildFailure(3), buildFailure(4)], reject: null },
      { receipts: [buildFailure(1), buildFailure(2, { runId: 'p7-activation-synthetic-other-run' }), buildFailure(3)], reject: null }
    ];
    let tamperRejectedCount = 0;
    for (const scenario of tamperScenarios) {
      try {
        const selection = selectNextOperationsActivationStep(scenario.receipts, { approval });
        if (scenario.reject?.(selection)) tamperRejectedCount += 1;
      } catch { tamperRejectedCount += 1; }
    }
    if (tamperRejectedCount !== tamperScenarios.length) throw new Error('TAMPER_SCENARIO_NOT_REJECTED');
    const pausedAfterThreeCount = scenarioResults.filter(({ selection }) =>
      selection.status === 'PAUSED_OPERATIONS_ACTIVATION_STEP_FAILED_THREE_TIMES'
      && selection.failedAttempts === 3).length;
    const containedFailureCount = scenarioResults.filter(({ targetStepId, selection }) =>
      selection.step?.id === targetStepId).length;
    if (pausedAfterThreeCount !== OPERATIONS_ACTIVATION_STEPS.length
      || containedFailureCount !== OPERATIONS_ACTIVATION_STEPS.length || laterStepReceiptCount !== 0) {
      throw new Error('THREE_FAILURE_CONTAINMENT_MATRIX_INVALID');
    }
    result = {
      status: 'PASS_SYNTHETIC_OPERATIONS_ACTIVATION_THREE_FAILURE_MATRIX_REHEARSAL',
      scenarioCount: scenarioResults.length, containedFailureCount, pausedAfterThreeCount,
      laterStepReceiptCount, totalReceiptCount, physicalDocumentCount: countPhysicalFiles(root),
      tamperScenarioCount: tamperScenarios.length, tamperRejectedCount,
      childProcessCount: 0, syntheticOnly: true, actualActivationExecuted: false,
      externalMutationPerformed: false, secretValuesReadOrRecorded: false, productionGo: false
    };
  } finally {
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  }
  result.temporaryArtifactsRetained = fs.existsSync(root);
  return result;
}
