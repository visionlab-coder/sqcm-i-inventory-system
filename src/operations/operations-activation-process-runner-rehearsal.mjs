import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  OPERATIONS_ACTIVATION_ACTIONS,
  OPERATIONS_ACTIVATION_STEPS,
  claimOperationsActivationReceiptRoot,
  selectNextOperationsActivationStep
} from './operations-activation-orchestrator.mjs';
import { executeOperationsActivationSelection } from './operations-activation-process-runner.mjs';

function physicalTemporaryBase(temporaryBase) {
  const base = path.resolve(temporaryBase); const stat = fs.lstatSync(base);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)
    || path.resolve(fs.realpathSync(base)).toLowerCase() !== base.toLowerCase()) throw new Error('TEMPORARY_BASE_NOT_PHYSICAL');
  return base;
}

function countPhysicalFiles(root) {
  let count = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name); const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)) throw new Error('TEMPORARY_ARTIFACT_NOT_PHYSICAL');
    if (entry.isDirectory()) count += countPhysicalFiles(candidate);
    else if (entry.isFile()) count += 1;
    else throw new Error('TEMPORARY_ARTIFACT_TYPE_INVALID');
  }
  return count;
}

function syntheticApproval() {
  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'actual',
    approved: true,
    targetUrl: 'https://inventory.safe-link.co.kr',
    runId: 'p7-activation-synthetic-process-runner',
    releaseSha: 'a'.repeat(40),
    activationBundleSha256: 'b'.repeat(64),
    p6CutoverEvidenceSha256: 'c'.repeat(64),
    p6OperationsApprovalSha256: 'd'.repeat(64),
    approvalReceiptSha256: 'e'.repeat(64),
    authorizedByRef: 'identity://synthetic-operations-owner',
    approvedAt: '2026-09-12T00:00:00.000Z',
    expiresAt: '2026-10-01T00:00:00.000Z',
    allowedSteps: OPERATIONS_ACTIVATION_STEPS.map((step) => step.id),
    authorizedActions: [...OPERATIONS_ACTIVATION_ACTIONS]
  };
}

function createClaimedRoot(root, name, approval, processId) {
  const receiptRoot = path.join(root, name); fs.mkdirSync(receiptRoot);
  claimOperationsActivationReceiptRoot(receiptRoot, approval, {
    processId,
    checkedAt: '2026-09-12T00:01:00.000Z',
    claimId: `synthetic-process-runner-${name}`
  });
  return receiptRoot;
}

export function runOperationsActivationProcessRunnerRehearsal({ temporaryBase = os.tmpdir() } = {}) {
  const base = physicalTemporaryBase(temporaryBase);
  const root = fs.mkdtempSync(path.join(base, 'sqcmi-p7-process-runner-'));
  const relativeRoot = path.relative(base, root);
  if (!relativeRoot || relativeRoot.startsWith('..') || path.isAbsolute(relativeRoot)) throw new Error('TEMPORARY_ROOT_OUTSIDE_BASE');
  let result;
  try {
    const approval = syntheticApproval();
    const receiptRoot = createClaimedRoot(root, 'full-sequence', approval, 5001);
    const receipts = []; let childProcessCount = 0; let unexpectedEnvironmentPropagationCount = 0;
    let selection = selectNextOperationsActivationStep(receipts, { approval });
    while (selection.step) {
      const output = executeOperationsActivationSelection({
        projectRoot: root,
        selection,
        approval,
        receiptRoot,
        sourceEnvironment: {
          PATH: process.env.PATH ?? '',
          UNRELATED_SECRET: 'must-not-propagate',
          GITHUB_TOKEN: 'must-not-propagate',
          NODE_OPTIONS: '--require malicious'
        },
        spawnStep: ({ step, environment }) => {
          if ('UNRELATED_SECRET' in environment || 'GITHUB_TOKEN' in environment || 'NODE_OPTIONS' in environment) {
            unexpectedEnvironmentPropagationCount += 1;
          }
          return { exitCode: 0, stdout: JSON.stringify({ status: step.pass[0] }), stderr: 'synthetic-secret-not-recorded' };
        },
        checkedAt: new Date(Date.parse('2026-09-12T00:02:00.000Z') + receipts.length * 60000).toISOString(),
        receiptWriteOptions: { processId: 5100 + receipts.length }
      });
      childProcessCount += output.childProcessCount; receipts.push(output.receipt);
      selection = selectNextOperationsActivationStep(receipts, { approval });
    }

    const negativeScenarios = [
      { name: 'malformed-json', exitCode: 0, stdout: 'not-json', expectedOutcome: 'FAIL' },
      { name: 'exit-one-pass-text', exitCode: 1, stdout: JSON.stringify({ status: OPERATIONS_ACTIVATION_STEPS[0].pass[0] }), expectedOutcome: 'FAIL' },
      { name: 'timeout-pass-text', exitCode: 1, stdout: JSON.stringify({ status: OPERATIONS_ACTIVATION_STEPS[0].pass[0] }), failureStatus: 'FAIL_OPERATIONS_ACTIVATION_CHILD_TIMEOUT', expectedOutcome: 'FAIL', expectedStatus: 'FAIL_OPERATIONS_ACTIVATION_CHILD_TIMEOUT' },
      { name: 'redacted-output', exitCode: 0, stdout: `SECRET_VALUE\n${JSON.stringify({ status: OPERATIONS_ACTIVATION_STEPS[0].pass[0] })}`, stderr: 'SECRET_VALUE', expectedOutcome: 'PASS' }
    ];
    let negativeScenarioPassCount = 0; let secretValueOccurrenceCount = 0;
    for (const [index, scenario] of negativeScenarios.entries()) {
      const negativeRoot = createClaimedRoot(root, scenario.name, approval, 5200 + index);
      const negativeSelection = selectNextOperationsActivationStep([], { approval });
      const output = executeOperationsActivationSelection({
        projectRoot: root, selection: negativeSelection, approval, receiptRoot: negativeRoot,
        sourceEnvironment: { PATH: process.env.PATH ?? '' },
        spawnStep: () => ({ exitCode: scenario.exitCode, stdout: scenario.stdout, stderr: scenario.stderr ?? '', failureStatus: scenario.failureStatus ?? null }),
        checkedAt: new Date(Date.parse('2026-09-12T01:00:00.000Z') + index * 60000).toISOString(),
        receiptWriteOptions: { processId: 5300 + index }
      });
      const raw = fs.readFileSync(output.receiptPath, 'utf8');
      const occurrences = (raw.match(/SECRET_VALUE/g) ?? []).length; secretValueOccurrenceCount += occurrences;
      if (output.receipt.outcome === scenario.expectedOutcome
        && (!scenario.expectedStatus || output.receipt.status === scenario.expectedStatus)
        && occurrences === 0) negativeScenarioPassCount += 1;
    }

    if (selection.status !== 'PASS_OPERATIONS_ACTIVATION_SEQUENCE_COMPLETE'
      || receipts.length !== OPERATIONS_ACTIVATION_STEPS.length
      || childProcessCount !== OPERATIONS_ACTIVATION_STEPS.length
      || unexpectedEnvironmentPropagationCount !== 0
      || negativeScenarioPassCount !== negativeScenarios.length
      || secretValueOccurrenceCount !== 0) throw new Error('OPERATIONS_ACTIVATION_PROCESS_RUNNER_REHEARSAL_INVALID');
    result = {
      status: 'PASS_SYNTHETIC_OPERATIONS_ACTIVATION_PROCESS_RUNNER_REHEARSAL',
      activationStepCount: OPERATIONS_ACTIVATION_STEPS.length,
      childProcessCount,
      activationReceiptCount: receipts.length,
      sequenceComplete: true,
      finalSelectionStatus: selection.status,
      physicalDocumentCount: countPhysicalFiles(root),
      unexpectedEnvironmentPropagationCount,
      negativeScenarioCount: negativeScenarios.length,
      negativeScenarioPassCount,
      secretValueOccurrenceCount,
      syntheticOnly: true,
      actualActivationExecuted: false,
      externalMutationPerformed: false,
      secretValuesReadOrRecorded: false,
      productionGo: false
    };
  } finally {
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  }
  result.temporaryArtifactsRetained = fs.existsSync(root);
  return result;
}
