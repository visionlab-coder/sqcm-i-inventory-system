const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const modulePromise = import('../../src/operations/harness-remote-commit-content-attestation.mjs');

const hash = (value) => createHash('sha256').update(value).digest('hex');

function fixture() {
  const baseSha = '1'.repeat(40);
  const commit = '2'.repeat(40);
  const actualA = Buffer.from('actual-a\n');
  const actualB = Buffer.from('actual-b\n');
  const declaredA = hash(actualA);
  const declaredB = '0'.repeat(64);
  const actualFiles = [
    { path: 'a.txt', sha256: hash(actualA), bytes: actualA.length },
    { path: 'b.txt', sha256: hash(actualB), bytes: actualB.length }
  ];
  const actualContentDigest = hash(actualFiles.map((file) => `${file.path}|${file.sha256}`).join('\n'));
  const candidate = {
    baseSha,
    candidateFileCount: 3,
    hashedContentFileCount: 2,
    files: [
      { path: 'a.txt', sha256: declaredA },
      { path: 'b.txt', sha256: declaredB },
      { path: 'manifest.json', sha256: null }
    ]
  };
  const remoteEvidence = { commit, candidateCommit: commit };
  const attestation = {
    schemaVersion: 1,
    status: 'ACKNOWLEDGED_HISTORICAL_MANIFEST_MISMATCH',
    candidateCommit: commit,
    candidateControlSha256: 'c'.repeat(64),
    remoteEvidenceControlSha256: 'd'.repeat(64),
    deploymentBasis: false,
    actualContentDigest,
    actualFiles,
    historicalCandidateHashMismatches: [
      { path: 'b.txt', declaredSha256: declaredB, actualSha256: hash(actualB) }
    ]
  };
  const runGit = ({ args }) => {
    if (args[0] === 'diff-tree') return Buffer.from('a.txt\nb.txt\nmanifest.json\n');
    if (args[0] === 'rev-parse') return Buffer.from(`${baseSha}\n`);
    if (args[0] === 'show' && args[1].endsWith(':a.txt')) return actualA;
    if (args[0] === 'show' && args[1].endsWith(':b.txt')) return actualB;
    throw new Error('UNEXPECTED_GIT_CALL');
  };
  return { candidate, remoteEvidence, attestation, runGit };
}

test('원격 commit actual blobs와 역사적 mismatch를 별도 attestation으로 검증한다', async () => {
  const { verifyHarnessRemoteCommitContentAttestation } = await modulePromise;
  const input = fixture();
  const result = verifyHarnessRemoteCommitContentAttestation({
    projectRoot: process.cwd(),
    ...input,
    candidateControlSha256: 'c'.repeat(64),
    remoteEvidenceControlSha256: 'd'.repeat(64)
  });
  assert.equal(result.status, 'PASS_ACKNOWLEDGED_HISTORICAL_MANIFEST_MISMATCH');
  assert.equal(result.actualFileCount, 2);
  assert.equal(result.matchCount, 1);
  assert.equal(result.mismatchCount, 1);
  assert.equal(result.deploymentBasis, false);
});

test('attestation hash 변조와 mismatch 누락을 fail-closed한다', async () => {
  const { verifyHarnessRemoteCommitContentAttestation } = await modulePromise;
  const input = fixture();
  input.attestation.actualFiles[1].sha256 = 'f'.repeat(64);
  assert.throws(() => verifyHarnessRemoteCommitContentAttestation({
    projectRoot: process.cwd(),
    ...input,
    candidateControlSha256: 'c'.repeat(64),
    remoteEvidenceControlSha256: 'd'.repeat(64)
  }), /HARNESS_REMOTE_COMMIT_ATTESTATION_CONTENT_MISMATCH/);
});

test('불일치를 현재 deployment basis로 승격하지 못한다', async () => {
  const { verifyHarnessRemoteCommitContentAttestation } = await modulePromise;
  const input = fixture();
  input.attestation.deploymentBasis = true;
  assert.throws(() => verifyHarnessRemoteCommitContentAttestation({
    projectRoot: process.cwd(),
    ...input,
    candidateControlSha256: 'c'.repeat(64),
    remoteEvidenceControlSha256: 'd'.repeat(64)
  }), /HARNESS_REMOTE_COMMIT_ATTESTATION_DEPLOYMENT_BASIS_INVALID/);
});
