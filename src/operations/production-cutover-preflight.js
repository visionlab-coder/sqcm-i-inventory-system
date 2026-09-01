export const PRODUCTION_CHANGE_WINDOW = Object.freeze({
  start: '2026-09-11T11:00:00.000Z',
  rollbackCutoff: '2026-09-11T13:00:00.000Z',
  end: '2026-09-11T14:00:00.000Z'
});

const REQUIRED_SERVICES = ['backend', 'database', 'frontend'];
const REQUIRED_TUNNELS = ['sqcm-i', 'sqcm-i-inventory-staging'];

export function evaluateProductionCutoverPreflight(observation) {
  const localBlockers = [];
  const externalPending = [];
  const serviceNames = (observation.services || []).map((service) => service.name).sort();
  const servicesHealthy = (observation.services || []).every((service) => service.health === 'healthy');
  const tunnelMap = new Map((observation.tunnels || []).map((tunnel) => [tunnel.name, tunnel.connections]));

  if (!observation.remoteShaMatched) localBlockers.push('REMOTE_SHA_MISMATCH');
  if (JSON.stringify(serviceNames) !== JSON.stringify(REQUIRED_SERVICES) || !servicesHealthy) {
    localBlockers.push('PRODUCTION_THREE_SERVICES_NOT_HEALTHY');
  }
  if (observation.frontendBinding !== '127.0.0.1:3300') localBlockers.push('FRONTEND_LOOPBACK_BINDING_MISMATCH');
  if (observation.backendHostPortCount !== 0) localBlockers.push('BACKEND_HOST_PORT_EXPOSED');
  if (observation.databaseHostPortCount !== 0) localBlockers.push('DATABASE_HOST_PORT_EXPOSED');
  if (!observation.smokePassed) localBlockers.push('LOCAL_SMOKE_FAILED');
  if (observation.applicationMigrations !== 25) localBlockers.push('APPLICATION_MIGRATION_COUNT_MISMATCH');
  if (!observation.backupRestoreVerified) localBlockers.push('BACKUP_RESTORE_NOT_VERIFIED');
  if (!observation.protectedServicesPreserved) localBlockers.push('PROTECTED_SERVICE_CHANGED');
  if (!REQUIRED_TUNNELS.every((name) => (tunnelMap.get(name) || 0) > 0)) {
    localBlockers.push('EXISTING_TUNNEL_NOT_PRESERVED');
  }

  const now = new Date(observation.now);
  const start = new Date(PRODUCTION_CHANGE_WINDOW.start);
  const end = new Date(PRODUCTION_CHANGE_WINDOW.end);
  const insideWindow = now >= start && now <= end;
  if (!insideWindow) externalPending.push('OUTSIDE_APPROVED_CHANGE_WINDOW');
  if (!observation.productionTunnelExists) externalPending.push('PRODUCTION_TUNNEL_MISSING');
  if (!observation.dnsPublished) externalPending.push('PRODUCTION_DNS_NXDOMAIN');
  if (observation.productionUsers < 3) externalPending.push('PRODUCTION_ROLE_USERS_MISSING');
  if (!observation.actualCutoverEvidenceExists) externalPending.push('ACTUAL_CUTOVER_EVIDENCE_MISSING');

  let status = 'READY_FOR_CUTOVER_SIGNOFF';
  if (localBlockers.length) status = 'BLOCKED_LOCAL_PREFLIGHT';
  else if (!insideWindow) status = 'READY_WAIT_CHANGE_WINDOW';
  else if (externalPending.length) status = 'READY_FOR_CHANGE_WINDOW_EXECUTION';

  return {
    status,
    insideWindow,
    localBlockers,
    externalPending,
    productionGo: status === 'READY_FOR_CUTOVER_SIGNOFF'
  };
}
