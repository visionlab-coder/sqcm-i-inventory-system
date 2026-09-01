import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { evaluateProductionRollbackReadiness } from '../src/operations/production-rollback-readiness.mjs';

const g3 = JSON.parse(fs.readFileSync('agent docs/harness/P6_G3_AI_PC_PRODUCTION_DEPLOY_ROLLBACK_EVIDENCE.json', 'utf8'));

function composeContainer(service) {
  const result = spawnSync('docker', [
    'ps', '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
    '--filter', `label=com.docker.compose.service=${service}`, '--format', '{{.ID}}'
  ], { encoding: 'utf8', windowsHide: true });
  const ids = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (result.status !== 0 || ids.length !== 1) throw new Error(`Exactly one running Production ${service} container is required.`);
  return ids[0];
}

function inspect(service) {
  const result = spawnSync('docker', ['inspect', composeContainer(service)], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Unable to inspect Production ${service}.`);
  const [container] = JSON.parse(result.stdout);
  return {
    revision: container.Config.Labels?.['org.opencontainers.image.revision'] || '',
    image: container.Config.Image
  };
}

const volumeResult = spawnSync('docker', [
  'volume', 'ls', '--filter', 'label=com.docker.compose.project=seowon-inventory-production', '--format', '{{.Name}}'
], { encoding: 'utf8', windowsHide: true });
if (volumeResult.status !== 0) throw new Error('Unable to list Production volumes.');
const actualVolumes = volumeResult.stdout.trim().split(/\r?\n/).filter(Boolean);
const backend = inspect('backend');
const frontend = inspect('frontend');
const observation = {
  candidateSha: g3.source.candidateSha,
  backendRevision: backend.revision,
  frontendRevision: frontend.revision,
  requiredVolumes: ['seowon-inventory-production_postgres-data', 'seowon-inventory-production_file-data'],
  actualVolumes,
  previousDrill: g3.rollback,
  backupRestoreVerified: g3.backupAndRestore.restoreVerified === true && g3.backupAndRestore.sourceAndRestoredCountsMatched === true,
  changeWindow: PRODUCTION_CHANGE_WINDOW,
  routeRemoval: {
    tunnel: 'sqcm-i-inventory-production',
    hostname: 'inventory.safe-link.co.kr',
    preserveExistingTunnels: true,
    sequence: ['disable-public-route', 'verify-public-host-unreachable', 'retain-loopback-services-and-volumes']
  }
};
const result = evaluateProductionRollbackReadiness(observation);
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  ...result,
  candidateSha: observation.candidateSha,
  images: { backendRevision: backend.revision, frontendRevision: frontend.revision },
  volumes: { required: observation.requiredVolumes, presentCount: observation.requiredVolumes.filter((name) => actualVolumes.includes(name)).length },
  previousDrillVerified: result.failures.every((failure) => !failure.startsWith('PREVIOUS_DRILL_')),
  backupRestoreVerified: observation.backupRestoreVerified,
  changeWindow: observation.changeWindow,
  routeRemoval: observation.routeRemoval
}, null, 2));
if (result.failures.length) process.exitCode = 1;
