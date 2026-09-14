function validateImmutableImageConfig({ target = 'production', releaseTag = '', backendImage = '', frontendImage = '', allowVerifiedLocalProductionImages = false } = {}) {
  const failures = [];
  if (target === 'local') {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,127}$/.test(releaseTag)) failures.push('RELEASE_TAG must be a safe local tag.');
    return failures;
  }
  if (!/^sha-[0-9a-f]{40}$/.test(releaseTag)) failures.push('External deployment RELEASE_TAG must be sha- followed by the exact 40-character Git SHA.');
  if (allowVerifiedLocalProductionImages === true) {
    if (backendImage !== 'sqcm-r5-backend') failures.push('Verified local Production BACKEND_IMAGE must be sqcm-r5-backend.');
    if (frontendImage !== 'sqcm-r5-frontend') failures.push('Verified local Production FRONTEND_IMAGE must be sqcm-r5-frontend.');
    return failures;
  }
  const imagePattern = /^ghcr\.io\/[a-z0-9._-]+\/[a-z0-9._/-]+$/;
  if (!imagePattern.test(backendImage)) failures.push('BACKEND_IMAGE must be an exact lowercase GHCR repository without a tag.');
  if (!imagePattern.test(frontendImage)) failures.push('FRONTEND_IMAGE must be an exact lowercase GHCR repository without a tag.');
  if (backendImage && backendImage === frontendImage) failures.push('Backend and frontend images must use different repositories.');
  return failures;
}

module.exports = { validateImmutableImageConfig };
