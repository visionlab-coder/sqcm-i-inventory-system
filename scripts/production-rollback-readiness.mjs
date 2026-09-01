import fs from 'node:fs';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { evaluateProductionRollbackReadiness } from '../src/operations/production-rollback-readiness.mjs';
import {
  parseRollbackContainerId,
  parseRollbackInspect,
  parseRollbackVolumes,
  runRollbackReadinessDocker
} from '../src/operations/production-rollback-readiness-runtime.mjs';

const g3 = JSON.parse(fs.readFileSync('agent docs/harness/P6_G3_AI_PC_PRODUCTION_DEPLOY_ROLLBACK_EVIDENCE.json', 'utf8'));

function composeContainer(service) {
  const result = runRollbackReadinessDocker([
    'ps', '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
    '--filter', `label=com.docker.compose.service=${service}`, '--format', '{{.ID}}'
  ]);
  return parseRollbackContainerId(result.stdout);
}

function inspect(service) {
  const containerId = composeContainer(service);
  const result = runRollbackReadinessDocker(['inspect', containerId]);
  return parseRollbackInspect(result.stdout, containerId);
}

const volumeResult = runRollbackReadinessDocker([
  'volume', 'ls', '--filter', 'label=com.docker.compose.project=seowon-inventory-production', '--format', '{{.Name}}'
]);
const actualVolumes = parseRollbackVolumes(volumeResult.stdout);
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
