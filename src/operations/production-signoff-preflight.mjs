export const PRODUCTION_UAT_RESULT_ROLES = Object.freeze(['ADMIN', 'MANAGER', 'USER']);
export const PRODUCTION_SIGNOFF_AREAS = Object.freeze(['BUSINESS', 'SECURITY', 'OPERATIONS']);

export function evaluateProductionSignoffPreflight(observation) {
  if (observation.candidatePending !== true) {
    return {
      status: 'FAIL_SIGNOFF_CANDIDATE_STATE',
      missing: [],
      requiresExternalInput: false,
      requiresChangeWindow: false,
      productionGo: false
    };
  }

  const missing = [];
  for (const role of PRODUCTION_UAT_RESULT_ROLES) {
    if (observation.roleResultReferences?.[role] !== true) {
      missing.push(`${role}_UAT_RESULT_REFERENCE_MISSING`);
    }
  }
  for (const area of PRODUCTION_SIGNOFF_AREAS) {
    if (observation.signoffReferences?.[area] !== true) {
      missing.push(`${area}_SIGNOFF_REFERENCE_MISSING`);
    }
  }

  const referencesReady = missing.length === 0;
  return {
    status: !referencesReady
      ? 'READY_WAIT_PRODUCTION_UAT_AND_SIGNOFF_REFERENCES'
      : observation.insideWindow
        ? 'READY_FOR_UAT_SIGNOFF_VALIDATION'
        : 'READY_WAIT_CHANGE_WINDOW_FOR_UAT_SIGNOFF_VALIDATION',
    missing,
    requiresExternalInput: !referencesReady,
    requiresChangeWindow: referencesReady && !observation.insideWindow,
    productionGo: false
  };
}
