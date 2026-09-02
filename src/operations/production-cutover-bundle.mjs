import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import {
  CUTOVER_GATE_ADAPTER_PLAN,
  CUTOVER_ROUTE_DISABLE_ADAPTER,
  CUTOVER_INGRESS_ORPHAN_RECOVERY_ADAPTER
} from './production-cutover-gate-adapters.mjs';

export const PRODUCTION_CUTOVER_BUNDLE_FILE_MAX_BYTES = 4 * 1024 * 1024;
export const PRODUCTION_CUTOVER_BUNDLE_TOTAL_MAX_BYTES = 64 * 1024 * 1024;
const LOCAL_MODULE_SPECIFIER_PATTERN = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
const SHA256 = /^[a-f0-9]{64}$/;

export const PRODUCTION_CUTOVER_STEP_CONTRACTS = Object.freeze([
  ...Object.entries(CUTOVER_GATE_ADAPTER_PLAN).flatMap(([gate, steps]) => steps.map((step) => ({ gate, ...step }))),
  { gate: 'route_disable', ...CUTOVER_ROUTE_DISABLE_ADAPTER },
  { gate: 'ingress_orphan_recovery', ...CUTOVER_INGRESS_ORPHAN_RECOVERY_ADAPTER }
]);

function samePhysicalPath(left, right) {
  const a = path.resolve(left); const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function sameFileIdentity(before, after) {
  return before.size === after.size
    && (!Number.isInteger(before.dev) || !Number.isInteger(after.dev) || before.dev === after.dev)
    && (!Number.isInteger(before.ino) || !Number.isInteger(after.ino) || before.ino === after.ino)
    && (!Number.isFinite(before.mtimeMs) || !Number.isFinite(after.mtimeMs) || before.mtimeMs === after.mtimeMs);
}

function resolveLocalModulePath(fromFile, specifier, io = fs) {
  const unresolved = path.resolve(path.dirname(fromFile), specifier.split(/[?#]/, 1)[0]);
  const candidates = path.extname(unresolved)
    ? [unresolved]
    : [unresolved, `${unresolved}.mjs`, `${unresolved}.js`, `${unresolved}.cjs`, `${unresolved}.json`, path.join(unresolved, 'index.mjs'), path.join(unresolved, 'index.js')];
  return candidates.find((candidate) => io.existsSync(candidate)) ?? null;
}

function readSnapshotFile(candidate, { projectRoot, io = fs, maxFileBytes } = {}) {
  const root = path.resolve(projectRoot); const resolved = path.resolve(candidate); const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('CUTOVER_BUNDLE_PATH_INVALID');
  let rootBefore; let rootRealBefore; let before; let realBefore;
  try {
    rootBefore = io.lstatSync(root); rootRealBefore = path.resolve(io.realpathSync(root));
    before = io.lstatSync(resolved); realBefore = path.resolve(io.realpathSync(resolved));
  } catch { throw new Error('CUTOVER_BUNDLE_FILE_MISSING'); }
  if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink() || (rootBefore.isReparsePoint?.() ?? false)
    || !samePhysicalPath(rootRealBefore, root)) throw new Error('CUTOVER_BUNDLE_ROOT_NOT_PHYSICAL');
  if (!before.isFile() || before.isSymbolicLink() || (before.isReparsePoint?.() ?? false)
    || !samePhysicalPath(realBefore, resolved)) throw new Error('CUTOVER_BUNDLE_FILE_NOT_PHYSICAL');
  if (before.size < 1 || before.size > maxFileBytes) throw new Error('CUTOVER_BUNDLE_FILE_SIZE_INVALID');
  let content;
  try { content = io.readFileSync(resolved); } catch { throw new Error('CUTOVER_BUNDLE_FILE_READ_FAILED'); }
  if (!Buffer.isBuffer(content)) content = Buffer.from(content);
  let rootAfter; let rootRealAfter; let after; let realAfter;
  try {
    rootAfter = io.lstatSync(root); rootRealAfter = path.resolve(io.realpathSync(root));
    after = io.lstatSync(resolved); realAfter = path.resolve(io.realpathSync(resolved));
  } catch { throw new Error('CUTOVER_BUNDLE_FILE_UNSTABLE'); }
  if (content.length !== before.size || !samePhysicalPath(rootRealBefore, rootRealAfter)
    || !sameFileIdentity(rootBefore, rootAfter) || !samePhysicalPath(realBefore, realAfter)
    || !sameFileIdentity(before, after) || !after.isFile() || after.isSymbolicLink() || (after.isReparsePoint?.() ?? false)) {
    throw new Error('CUTOVER_BUNDLE_FILE_UNSTABLE');
  }
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(content); }
  catch { throw new Error('CUTOVER_BUNDLE_FILE_UTF8_INVALID'); }
  return { relativePath: relative.split(path.sep).join('/'), content, source, bytes: content.length };
}

function canonicalStep(step) {
  const contract = PRODUCTION_CUTOVER_STEP_CONTRACTS.find((item) => item.gate === step?.gate && item.id === step?.id && item.script === step?.script);
  if (!contract) throw new Error('CUTOVER_BUNDLE_STEP_CONTRACT_INVALID');
  return contract;
}

export function inspectProductionCutoverStepBundle(projectRoot, step, {
  io = fs,
  maxFileBytes = PRODUCTION_CUTOVER_BUNDLE_FILE_MAX_BYTES,
  maxTotalBytes = PRODUCTION_CUTOVER_BUNDLE_TOTAL_MAX_BYTES
} = {}) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)
    || !Number.isInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > PRODUCTION_CUTOVER_BUNDLE_FILE_MAX_BYTES
    || !Number.isInteger(maxTotalBytes) || maxTotalBytes < 1 || maxTotalBytes > PRODUCTION_CUTOVER_BUNDLE_TOTAL_MAX_BYTES) {
    throw new Error('CUTOVER_BUNDLE_INPUT_INVALID');
  }
  const contract = canonicalStep(step); const root = path.resolve(projectRoot);
  const pending = [contract.script]; const snapshots = new Map(); let totalBytes = 0;
  while (pending.length) {
    const relativePath = pending.pop(); if (snapshots.has(relativePath)) continue;
    const snapshot = readSnapshotFile(path.resolve(root, ...relativePath.split('/')), { projectRoot: root, io, maxFileBytes });
    if (snapshot.relativePath !== relativePath) throw new Error('CUTOVER_BUNDLE_PATH_INVALID');
    totalBytes += snapshot.bytes;
    if (totalBytes > maxTotalBytes) throw new Error('CUTOVER_BUNDLE_TOTAL_SIZE_INVALID');
    snapshots.set(relativePath, snapshot);
    if (path.extname(relativePath) === '.json') continue;
    for (const match of snapshot.source.matchAll(LOCAL_MODULE_SPECIFIER_PATTERN)) {
      const dependency = resolveLocalModulePath(path.resolve(root, ...relativePath.split('/')), match[1], io);
      if (!dependency) throw new Error(`CUTOVER_BUNDLE_DEPENDENCY_MISSING:${relativePath}`);
      const dependencyRelative = path.relative(root, dependency);
      if (!dependencyRelative || dependencyRelative.startsWith('..') || path.isAbsolute(dependencyRelative)) throw new Error('CUTOVER_BUNDLE_DEPENDENCY_OUTSIDE_ROOT');
      pending.push(dependencyRelative.split(path.sep).join('/'));
    }
  }
  const ordered = [...snapshots.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const hash = createHash('sha256'); hash.update(`SQCM-I-P6-CUTOVER-STEP-BUNDLE-V1\0${contract.gate}:${contract.id}\0`, 'utf8');
  for (const snapshot of ordered) {
    const pathBytes = Buffer.byteLength(snapshot.relativePath, 'utf8');
    hash.update(`${pathBytes}:`, 'utf8'); hash.update(snapshot.relativePath, 'utf8');
    hash.update(`:${snapshot.bytes}:`, 'utf8'); hash.update(snapshot.content);
  }
  return { gate: contract.gate, step: contract.id, files: ordered.map((item) => item.relativePath), totalBytes, sha256: hash.digest('hex') };
}

export function inspectProductionCutoverBundleManifest(projectRoot, options = {}) {
  const stepBundles = Object.fromEntries(PRODUCTION_CUTOVER_STEP_CONTRACTS.map((step) => {
    const bundle = inspectProductionCutoverStepBundle(projectRoot, step, options);
    return [`${step.gate}:${step.id}`, bundle.sha256];
  }));
  if (!Object.values(stepBundles).every((value) => SHA256.test(value))) throw new Error('CUTOVER_BUNDLE_DIGEST_INVALID');
  const hash = createHash('sha256'); hash.update('SQCM-I-P6-CUTOVER-BUNDLE-MANIFEST-V1\0', 'utf8');
  for (const key of Object.keys(stepBundles).sort()) hash.update(`${key}:${stepBundles[key]}\0`, 'utf8');
  return { stepBundles, sha256: hash.digest('hex') };
}
