import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export const HARNESS_REMOTE_GIT_TIMEOUT_MS = 10_000;
export const HARNESS_REMOTE_GIT_METADATA_MAX_BYTES = 1024 * 1024;
export const HARNESS_REMOTE_GIT_FILE_MAX_BYTES = 8 * 1024 * 1024;
export const HARNESS_REMOTE_GIT_TOTAL_MAX_BYTES = 64 * 1024 * 1024;

const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function attestationError(code) {
  const error = new Error(code);
  error.name = 'HarnessRemoteCommitContentAttestationError';
  return error;
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function validRelativePath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.includes('\\') || path.posix.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value);
  return normalized === value && normalized !== '.' && !normalized.startsWith('../') && !normalized.includes('/../');
}

function canonicalFiles(files) {
  return files.map((file) => `${file.path}|${file.sha256}`).join('\n');
}

export function runHarnessRemoteGit({ projectRoot, args, maxBytes }) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)
    || !Array.isArray(args) || args.length < 1
    || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > HARNESS_REMOTE_GIT_FILE_MAX_BYTES) {
    throw attestationError('HARNESS_REMOTE_COMMIT_ATTESTATION_REFERENCE_INVALID');
  }
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: null,
    shell: false,
    timeout: HARNESS_REMOTE_GIT_TIMEOUT_MS,
    maxBuffer: maxBytes
  });
  if (result.error || result.signal || result.status !== 0 || !Buffer.isBuffer(result.stdout)
    || result.stdout.length > maxBytes) {
    throw attestationError('HARNESS_REMOTE_COMMIT_ATTESTATION_GIT_FAILED');
  }
  return result.stdout;
}

export function verifyHarnessRemoteCommitContentAttestation({
  projectRoot,
  candidate,
  remoteEvidence,
  attestation,
  candidateControlSha256,
  remoteEvidenceControlSha256,
  runGit = runHarnessRemoteGit
}) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)
    || !candidate || typeof candidate !== 'object'
    || !remoteEvidence || typeof remoteEvidence !== 'object'
    || !attestation || typeof attestation !== 'object'
    || !SHA256.test(candidateControlSha256 ?? '') || !SHA256.test(remoteEvidenceControlSha256 ?? '')) {
    throw attestationError('HARNESS_REMOTE_COMMIT_ATTESTATION_REFERENCE_INVALID');
  }
  const commit = remoteEvidence.commit;
  if (!SHA40.test(commit ?? '') || remoteEvidence.candidateCommit !== commit
    || attestation.schemaVersion !== 1 || attestation.candidateCommit !== commit
    || attestation.candidateControlSha256 !== candidateControlSha256
    || attestation.remoteEvidenceControlSha256 !== remoteEvidenceControlSha256) {
    throw attestationError('HARNESS_REMOTE_COMMIT_ATTESTATION_PROVENANCE_MISMATCH');
  }
  if (!Array.isArray(candidate.files) || candidate.candidateFileCount !== candidate.files.length) {
    throw attestationError('HARNESS_REMOTE_COMMIT_ATTESTATION_FILESET_INVALID');
  }
  const allPaths = candidate.files.map((file) => file?.path);
  if (allPaths.some((value) => !validRelativePath(value)) || new Set(allPaths).size !== allPaths.length) {
    throw attestationError('HARNESS_REMOTE_COMMIT_ATTESTATION_FILESET_INVALID');
  }
  const contentFiles = candidate.files.filter((file) => file.sha256 !== null);
  if (candidate.hashedContentFileCount !== contentFiles.length
    || contentFiles.some((file) => !SHA256.test(file.sha256 ?? ''))) {
    throw attestationError('HARNESS_REMOTE_COMMIT_ATTESTATION_FILESET_INVALID');
  }

  const changedRaw = runGit({
    projectRoot,
    args: ['diff-tree', '-z', '--no-commit-id', '--name-only', '-r', commit],
    maxBytes: HARNESS_REMOTE_GIT_METADATA_MAX_BYTES
  });
  const separator = changedRaw.includes(0) ? /\0/ : /\r?\n/;
  const changedPaths = changedRaw.toString('utf8').split(separator).filter(Boolean).sort();
  if (JSON.stringify(changedPaths) !== JSON.stringify([...allPaths].sort())) {
    throw attestationError('HARNESS_REMOTE_COMMIT_ATTESTATION_ALLOWLIST_MISMATCH');
  }
  const parent = runGit({
    projectRoot,
    args: ['rev-parse', `${commit}^`],
    maxBytes: HARNESS_REMOTE_GIT_METADATA_MAX_BYTES
  }).toString('utf8').trim();
  if (!SHA40.test(candidate.baseSha ?? '') || parent !== candidate.baseSha) {
    throw attestationError('HARNESS_REMOTE_COMMIT_ATTESTATION_PARENT_MISMATCH');
  }

  let totalBytes = 0;
  const actualFiles = contentFiles.map((file) => {
    const raw = runGit({ projectRoot, args: ['show', `${commit}:${file.path}`], maxBytes: HARNESS_REMOTE_GIT_FILE_MAX_BYTES });
    totalBytes += raw.length;
    if (totalBytes > HARNESS_REMOTE_GIT_TOTAL_MAX_BYTES) {
      throw attestationError('HARNESS_REMOTE_COMMIT_ATTESTATION_TOTAL_SIZE_INVALID');
    }
    return { path: file.path, sha256: hash(raw), bytes: raw.length };
  });
  const actualDigest = hash(Buffer.from(canonicalFiles(actualFiles), 'utf8'));
  if (!Array.isArray(attestation.actualFiles)
    || JSON.stringify(attestation.actualFiles) !== JSON.stringify(actualFiles)
    || attestation.actualContentDigest !== actualDigest) {
    throw attestationError('HARNESS_REMOTE_COMMIT_ATTESTATION_CONTENT_MISMATCH');
  }

  const mismatches = actualFiles.flatMap((actual, index) => contentFiles[index].sha256 === actual.sha256 ? [] : [{
    path: actual.path,
    declaredSha256: contentFiles[index].sha256,
    actualSha256: actual.sha256
  }]);
  if (JSON.stringify(attestation.historicalCandidateHashMismatches) !== JSON.stringify(mismatches)) {
    throw attestationError('HARNESS_REMOTE_COMMIT_ATTESTATION_CONTENT_MISMATCH');
  }
  if (mismatches.length > 0) {
    if (attestation.status !== 'ACKNOWLEDGED_HISTORICAL_MANIFEST_MISMATCH' || attestation.deploymentBasis !== false) {
      throw attestationError('HARNESS_REMOTE_COMMIT_ATTESTATION_DEPLOYMENT_BASIS_INVALID');
    }
  } else if (attestation.status !== 'VERIFIED_REMOTE_COMMIT_CONTENT') {
    throw attestationError('HARNESS_REMOTE_COMMIT_ATTESTATION_STATUS_INVALID');
  }
  return {
    status: mismatches.length > 0 ? 'PASS_ACKNOWLEDGED_HISTORICAL_MANIFEST_MISMATCH' : 'PASS_VERIFIED_REMOTE_COMMIT_CONTENT',
    candidateCommit: commit,
    actualContentDigest: actualDigest,
    actualFileCount: actualFiles.length,
    totalBytes,
    matchCount: actualFiles.length - mismatches.length,
    mismatchCount: mismatches.length,
    deploymentBasis: attestation.deploymentBasis
  };
}
