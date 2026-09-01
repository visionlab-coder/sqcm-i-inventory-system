import fs from 'node:fs';
import path from 'node:path';

export const SIGNOFF_REFERENCE_MAX_BYTES = 1024 * 1024;

function isInsideOrEqual(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function physicalExternalJsonReference(value, projectRoot, io) {
  try {
    if (typeof value !== 'string' || !path.isAbsolute(value) || path.extname(value).toLowerCase() !== '.json') return null;
    const root = path.resolve(projectRoot);
    const rootStat = io.lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (rootStat.isReparsePoint?.() ?? false)) return null;
    const rootReal = path.resolve(io.realpathSync(root));
    const candidate = path.resolve(value);
    if (isInsideOrEqual(root, candidate)) return null;
    const candidateStat = io.lstatSync(candidate);
    if (!candidateStat.isFile() || candidateStat.isSymbolicLink() || (candidateStat.isReparsePoint?.() ?? false)
      || candidateStat.size < 1 || candidateStat.size > SIGNOFF_REFERENCE_MAX_BYTES) return null;
    const candidateReal = path.resolve(io.realpathSync(candidate));
    if (isInsideOrEqual(rootReal, candidateReal)) return null;
    return candidateReal;
  } catch {
    return null;
  }
}

export function validateSignoffReferenceSet(references, { projectRoot, io = fs } = {}) {
  if (!references || typeof references !== 'object' || Array.isArray(references)
    || typeof projectRoot !== 'string' || !projectRoot) {
    return {};
  }
  const presence = Object.fromEntries(Object.keys(references).map((key) => [key, false]));
  const canonicalGroups = new Map();
  for (const [key, value] of Object.entries(references)) {
    const canonical = physicalExternalJsonReference(value, projectRoot, io);
    if (!canonical) continue;
    const identity = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
    const group = canonicalGroups.get(identity) ?? [];
    group.push(key);
    canonicalGroups.set(identity, group);
  }
  for (const keys of canonicalGroups.values()) {
    if (keys.length === 1) presence[keys[0]] = true;
  }
  return presence;
}
