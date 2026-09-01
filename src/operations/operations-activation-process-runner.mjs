import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractLastJsonObject } from './production-cutover-process-runner.mjs';
import {
  buildOperationsActivationChildEnvironment,
  buildOperationsActivationReceipt,
  writeOperationsActivationReceiptOnce
} from './operations-activation-orchestrator.mjs';

function normalizeChildFailureStatus(child) {
  if (child?.error?.code === 'ETIMEDOUT') return 'FAIL_OPERATIONS_ACTIVATION_CHILD_TIMEOUT';
  if (child?.error?.code === 'ENOBUFS') return 'FAIL_OPERATIONS_ACTIVATION_CHILD_OUTPUT_LIMIT';
  if (child?.error) return 'FAIL_OPERATIONS_ACTIVATION_CHILD_SPAWN_ERROR';
  if (child?.signal) return 'FAIL_OPERATIONS_ACTIVATION_CHILD_SIGNAL';
  return null;
}

export function spawnOperationsActivationChild({
  projectRoot,
  step,
  environment,
  timeoutMs = 30 * 60 * 1000,
  maxBufferBytes = 1024 * 1024
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 4 * 60 * 60 * 1000) {
    throw new Error('OPERATIONS_ACTIVATION_CHILD_TIMEOUT_INVALID');
  }
  if (!Number.isInteger(maxBufferBytes) || maxBufferBytes < 256 || maxBufferBytes > 16 * 1024 * 1024) {
    throw new Error('OPERATIONS_ACTIVATION_CHILD_BUFFER_INVALID');
  }
  const child = spawnSync(process.execPath, [path.join(projectRoot, 'scripts', step.script), ...step.args], {
    cwd: projectRoot,
    env: environment,
    encoding: 'utf8',
    shell: false,
    timeout: timeoutMs,
    maxBuffer: maxBufferBytes,
    windowsHide: true
  });
  return {
    exitCode: Number.isInteger(child.status) ? child.status : 1,
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
    failureStatus: normalizeChildFailureStatus(child)
  };
}

export function executeOperationsActivationSelection({
  projectRoot,
  selection,
  approval,
  receiptRoot,
  sourceEnvironment = process.env,
  spawnStep = spawnOperationsActivationChild,
  checkedAt = new Date().toISOString(),
  receiptWriteOptions = {}
} = {}) {
  if (!selection?.step || String(selection.status ?? '').startsWith('PAUSED_')) {
    throw new Error('OPERATIONS_ACTIVATION_PROCESS_SELECTION_INVALID');
  }
  if (typeof spawnStep !== 'function') throw new Error('OPERATIONS_ACTIVATION_PROCESS_RUNNER_INVALID');
  const environment = buildOperationsActivationChildEnvironment(selection.step, sourceEnvironment);
  let raw;
  try {
    raw = spawnStep({ projectRoot, step: selection.step, environment });
  } catch {
    raw = { exitCode: 1, stdout: '', stderr: '', failureStatus: 'FAIL_OPERATIONS_ACTIVATION_CHILD_SPAWN_EXCEPTION' };
  }
  const execution = {
    exitCode: Number.isInteger(raw?.exitCode) ? raw.exitCode : 1,
    stdout: typeof raw?.stdout === 'string' ? raw.stdout : '',
    stderr: typeof raw?.stderr === 'string' ? raw.stderr : '',
    failureStatus: typeof raw?.failureStatus === 'string' && raw.failureStatus.startsWith('FAIL_OPERATIONS_ACTIVATION_CHILD_')
      ? raw.failureStatus
      : null
  };
  const summary = execution.failureStatus
    ? { status: execution.failureStatus }
    : extractLastJsonObject(execution.stdout);
  const receipt = buildOperationsActivationReceipt({
    approval,
    step: selection.step,
    attempt: selection.attempt,
    result: { ...execution, summary },
    checkedAt
  });
  const receiptPath = writeOperationsActivationReceiptOnce(receiptRoot, receipt, receiptWriteOptions);
  const status = receipt.outcome === 'PASS'
    ? 'PASS_OPERATIONS_ACTIVATION_STEP'
    : receipt.outcome === 'WAIT'
      ? 'READY_WAIT_OPERATIONS_ACTIVATION_STEP'
      : 'FAIL_OPERATIONS_ACTIVATION_STEP';
  return { status, receipt, receiptPath, childProcessCount: 1, environment };
}
