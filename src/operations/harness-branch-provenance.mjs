export function resolveActiveBranch({ githubHeadRef = '', githubRefName = '', symbolicRef = '' } = {}) {
  const candidates = [githubHeadRef, githubRefName, symbolicRef];
  for (const candidate of candidates) {
    const normalized = String(candidate ?? '').trim().replace(/^refs\/heads\//, '');
    if (normalized && normalized !== 'HEAD' && normalized !== 'merge') return normalized;
  }
  return null;
}

export function evaluateHarnessBranchProvenance({ roadmapBranch, activeBranch } = {}) {
  if (!activeBranch) return { ok: false, error: 'ACTIVE_GIT_BRANCH_UNRESOLVED' };
  if (!roadmapBranch || roadmapBranch !== activeBranch) {
    return {
      ok: false,
      error: `ROADMAP_BRANCH_MISMATCH:${roadmapBranch || 'missing'}:${activeBranch}`
    };
  }
  return { ok: true, error: null };
}
