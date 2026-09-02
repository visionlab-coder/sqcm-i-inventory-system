import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeCreateOnlyJsonOutput } from './operations-create-only-json-output.mjs';

export const PRODUCTION_CUTOVER_RECEIPT_ROOT = 'D:\\seowon_runtime\\sqcm-i-inventory-production\\cutover-receipts';

export function extractLastJsonObject(text) {
  const source = String(text || '');
  let last = null;
  let start = 0;
  while (start < source.length) {
    start = source.indexOf('{', start);
    if (start === -1) break;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let end = start; end < source.length; end += 1) {
      const char = source[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          try { last = JSON.parse(source.slice(start, end + 1)); } catch { /* continue */ }
          start = end + 1;
          break;
        }
      }
    }
    if (depth !== 0) start += 1;
  }
  return last;
}

export function normalizeStepOutcome({ exitCode, stdout, step } = {}) {
  const code = Number.isInteger(exitCode) ? exitCode : -1;
  if (step?.id === 'migration-verify' && code === 0) return { exitCode: 0, status: 'PASS_EXIT_ZERO' };
  const parsed = extractLastJsonObject(stdout);
  return { exitCode: code, status: typeof parsed?.status === 'string' ? parsed.status : 'FAIL_STATUS_NOT_RECORDED' };
}

export function buildStepReceiptSummary(step, parsed) {
  if (step?.id !== 'role-core-smoke' || parsed?.status !== 'PASS_PRODUCTION_ROLE_CORE_SMOKE') return null;
  const roles = {};
  for (const role of ['ADMIN', 'MANAGER', 'USER']) {
    const value = parsed?.results?.[role] || {};
    roles[role] = Object.fromEntries(['passwordStatus', 'mfaRequired', 'invalidMfaStatus', 'mfaStatus', 'actualRole', 'dashboard', 'cost', 'admin', 'logoutStatus']
      .map((key) => [key, value[key]]));
  }
  return {
    evidenceType: 'P6_ROLE_CORE_SMOKE_SUMMARY',
    targetKind: parsed.targetKind,
    actualRoleCoreSmoke: parsed.actualRoleCoreSmoke,
    anonymousItems: parsed?.results?.anonymousItems,
    roles
  };
}

function assertPhysicalDirectory(root, io = fs) {
  const resolved = path.resolve(root);
  const stat = io.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)) throw new Error('CUTOVER_RECEIPT_ROOT_NOT_PHYSICAL');
  if (path.resolve(io.realpathSync(resolved)).toLowerCase() !== resolved.toLowerCase()) throw new Error('CUTOVER_RECEIPT_ROOT_PATH_MISMATCH');
  return resolved;
}

function safeSegment(value) {
  const result = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-');
  if (!result || result === '-' || result.length > 100) throw new Error('CUTOVER_RECEIPT_SEGMENT_INVALID');
  return result;
}

export function createRuntimeReceiptWriter({
  root = PRODUCTION_CUTOVER_RECEIPT_ROOT,
  io = fs,
  clock = () => new Date(),
  runId = randomUUID(),
  startSequence = 0,
  processId = process.pid
} = {}) {
  if (!/^[a-f0-9]{8}-[a-f0-9-]{27,35}$/i.test(runId)) throw new Error('CUTOVER_RUN_ID_INVALID');
  if (!Number.isSafeInteger(startSequence) || startSequence < 0) throw new Error('CUTOVER_RECEIPT_START_SEQUENCE_INVALID');
  let sequence = startSequence;
  const writer = async ({ kind = 'step', gate, step = 'gate', status, exitCode = 0, stepEvidenceRefs = [], summary = null } = {}) => {
    const resolvedRoot = assertPhysicalDirectory(root, io);
    const checkedAt = clock().toISOString();
    sequence += 1;
    const fileName = `${checkedAt.replace(/[:.]/g, '-')}-${String(sequence).padStart(4, '0')}-${safeSegment(kind)}-${safeSegment(gate)}-${safeSegment(step)}.json`;
    const target = path.resolve(resolvedRoot, fileName);
    if (path.dirname(target).toLowerCase() !== resolvedRoot.toLowerCase()) throw new Error('CUTOVER_RECEIPT_PATH_ESCAPE');
    const payload = {
      schemaVersion: 1, runId, checkedAt, kind, gate, step, status, exitCode,
      evidenceRefs: stepEvidenceRefs.map((item) => path.basename(String(item))),
      productionGo: false
    };
    if (summary !== null) payload.summary = summary;
    return writeCreateOnlyJsonOutput(target, payload, {
      io,
      processId,
      alreadyExistsCode: 'CUTOVER_RECEIPT_ALREADY_EXISTS'
    });
  };
  Object.defineProperty(writer, 'runId', { value: runId, enumerable: true });
  return writer;
}

export function spawnNodeStep({ script, args = [], cwd = process.cwd() } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', () => resolve({ exitCode: -1, stdout: '', stderr: '' }));
    child.on('close', (code) => resolve({ exitCode: Number.isInteger(code) ? code : -1, stdout, stderr }));
  });
}

export function createProcessStepRunner({ spawnStep = spawnNodeStep, writeReceipt, cwd = process.cwd() } = {}) {
  if (typeof spawnStep !== 'function' || typeof writeReceipt !== 'function') throw new Error('CUTOVER_PROCESS_RUNNER_DEPENDENCY_INVALID');
  return async (step) => {
    const raw = await spawnStep({ script: step.script, args: step.args, cwd });
    const outcome = normalizeStepOutcome({ ...raw, step });
    const summary = buildStepReceiptSummary(step, extractLastJsonObject(raw.stdout));
    const evidenceRef = await writeReceipt({ kind: 'step', gate: step.gate, step: step.id, status: outcome.status, exitCode: outcome.exitCode, summary });
    return { ...outcome, evidenceRef };
  };
}

export function createGateEvidenceRecorder({ writeReceipt } = {}) {
  if (typeof writeReceipt !== 'function') throw new Error('CUTOVER_GATE_RECEIPT_DEPENDENCY_INVALID');
  return ({ gate, stepEvidenceRefs = [] }) => writeReceipt({ kind: 'gate', gate, step: 'summary', status: 'PASS', exitCode: 0, stepEvidenceRefs });
}
