export const R5_PRODUCTION_SERVICES = Object.freeze(['backend', 'database', 'frontend']);
export const R5_RUNTIME_PRESERVE_PATHS = Object.freeze([
  'backend:/app/src/company-master-provisioning.js',
  'backend:/app/src/provision-company-masters.js',
  'frontend:/etc/nginx/conf.d/default.conf',
  'frontend:/usr/share/nginx/html/index.html',
  'frontend:/usr/share/nginx/html/experience.css',
  'frontend:/usr/share/nginx/html/app.js'
]);

function unique(values) { return [...new Set(values)]; }

export function evaluateR5ProductionDriverPreflight({ approval, candidate, now, runtime = {}, backup = {}, credentials = {} } = {}) {
  const failures = [];
  const pending = [];
  const current = Number(now);
  const start = Date.parse(approval?.window?.start);
  const cutoff = Date.parse(approval?.window?.rollbackCutoff);
  const end = Date.parse(approval?.window?.end);

  if (!candidate || approval?.candidateSha !== candidate.sha || approval?.target !== candidate.target || approval?.publicUrl !== candidate.publicUrl) {
    failures.push('R5_APPROVAL_CANDIDATE_TARGET_MISMATCH');
  }
  if (![start, cutoff, end, current].every(Number.isFinite) || !(start < cutoff && cutoff < end)) failures.push('R5_CHANGE_WINDOW_INVALID');
  else if (current < start || current >= cutoff) pending.push(current >= end ? 'R5_CHANGE_WINDOW_EXPIRED' : 'R5_OUTSIDE_EXECUTION_INTERVAL');

  if (runtime.composeProject !== 'seowon-inventory-production') failures.push('R5_PRODUCTION_PROJECT_MISMATCH');
  const services = Array.isArray(runtime.services) ? runtime.services : [];
  const names = services.map((service) => service.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(R5_PRODUCTION_SERVICES)) failures.push('R5_SERVICE_SET_NOT_EXACTLY_THREE');
  for (const name of R5_PRODUCTION_SERVICES) {
    const service = services.find((item) => item.name === name);
    if (!service?.running || !service?.healthy) failures.push(`R5_${name.toUpperCase()}_NOT_HEALTHY`);
    if (['backend', 'database'].includes(name) && (service?.publishedPorts?.length ?? 0) !== 0) failures.push(`R5_${name.toUpperCase()}_HOST_PORT_EXPOSED`);
  }
  const frontend = services.find((item) => item.name === 'frontend');
  if (JSON.stringify(frontend?.publishedPorts ?? []) !== JSON.stringify(['127.0.0.1:3300'])) failures.push('R5_FRONTEND_BINDING_UNEXPECTED');
  if (runtime.activeClientWrites !== 0) failures.push('R5_ACTIVE_CLIENT_WRITES_NOT_ZERO');

  if (runtime.candidateBackendImageId !== candidate?.backendImage) failures.push('R5_BACKEND_IMAGE_NOT_BOUND');
  if (runtime.candidateFrontendImageId !== candidate?.frontendImage) failures.push('R5_FRONTEND_IMAGE_NOT_BOUND');
  if (runtime.candidateBackendRevision !== candidate?.sha || runtime.candidateFrontendRevision !== candidate?.sha) failures.push('R5_IMAGE_REVISION_NOT_BOUND');

  if (!backup.physicalDirectory || backup.reparsePoint || !backup.inheritanceDisabled) failures.push('R5_BACKUP_DIRECTORY_NOT_PRIVATE_PHYSICAL');
  if (!backup.currentUserFullControl || !backup.systemFullControl || !backup.administratorsFullControl || backup.unexpectedPrincipalCount !== 0) {
    failures.push('R5_BACKUP_ACL_NOT_RESTRICTED');
  }
  const preserved = new Set(backup.runtimePreservePaths ?? []);
  for (const item of R5_RUNTIME_PRESERVE_PATHS) if (!preserved.has(item)) failures.push(`R5_RUNTIME_PRESERVE_PATH_MISSING:${item}`);
  if ((backup.unexpectedRuntimeChanges ?? []).length) failures.push('R5_UNEXPECTED_RUNTIME_CHANGE_PRESENT');

  for (const role of ['ADMIN', 'MANAGER', 'USER']) if (credentials[role] !== true) pending.push(`R5_${role}_CREDENTIAL_REFERENCE_NOT_READY`);

  const technicalReady = failures.length === 0 && !pending.some((item) => item.includes('CREDENTIAL'));
  return {
    status: failures.length ? 'BLOCKED_R5_PRODUCTION_DRIVER_PREFLIGHT'
      : pending.length ? 'READY_WAIT_R5_CHANGE_WINDOW'
        : 'PASS_R5_PRODUCTION_DRIVER_PREFLIGHT',
    failures: unique(failures),
    pending: unique(pending),
    technicalReady,
    safeToMutate: technicalReady && pending.length === 0,
    externalMutationPerformed: false,
    secretValuesReadOrRecorded: false
  };
}
