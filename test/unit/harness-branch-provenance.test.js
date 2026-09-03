const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../../src/operations/harness-branch-provenance.mjs');

test('GitHub pull request head branch를 detached ref보다 우선한다', async () => {
  const { resolveActiveBranch } = await modulePromise;
  assert.equal(resolveActiveBranch({ githubHeadRef: 'codex/feature', githubRefName: '123/merge', symbolicRef: '' }), 'codex/feature');
});

test('GitHub branch와 local symbolic ref를 정규화한다', async () => {
  const { resolveActiveBranch } = await modulePromise;
  assert.equal(resolveActiveBranch({ githubRefName: 'codex/p6-ai-pc-postgres-production' }), 'codex/p6-ai-pc-postgres-production');
  assert.equal(resolveActiveBranch({ symbolicRef: 'refs/heads/codex/local' }), 'codex/local');
});

test('detached HEAD만 있으면 branch provenance를 해석하지 않는다', async () => {
  const { resolveActiveBranch, evaluateHarnessBranchProvenance } = await modulePromise;
  const activeBranch = resolveActiveBranch({ symbolicRef: 'HEAD' });
  assert.equal(activeBranch, null);
  assert.equal(evaluateHarnessBranchProvenance({ roadmapBranch: 'codex/main', activeBranch }).error, 'ACTIVE_GIT_BRANCH_UNRESOLVED');
});

test('정본과 실제 branch 불일치를 fail-closed 한다', async () => {
  const { evaluateHarnessBranchProvenance } = await modulePromise;
  assert.equal(evaluateHarnessBranchProvenance({ roadmapBranch: 'codex/old', activeBranch: 'codex/current' }).error, 'ROADMAP_BRANCH_MISMATCH:codex/old:codex/current');
  assert.deepEqual(evaluateHarnessBranchProvenance({ roadmapBranch: 'codex/current', activeBranch: 'codex/current' }), { ok: true, error: null });
});
