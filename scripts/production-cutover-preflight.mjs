import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolve4, resolveCname } from 'node:dns/promises';
import { fileURLToPath } from 'node:url';
import { evaluateProductionCutoverPreflight, PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { observeCloudflareTunnels, runPreflightCommand } from '../src/operations/production-cutover-preflight-runtime.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args) => {
  const result = runPreflightCommand(command, args, { cwd: projectDir });
  if (!result.ok) throw new Error(`PREFLIGHT_${result.failure}`);
  return result.stdout;
};
const parseLines = (text) => text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

const headSha = run('git', ['rev-parse', 'HEAD']);
const branch = run('git', ['branch', '--show-current']);
const remoteLine = run('git', ['ls-remote', '--heads', 'origin', branch]);
const remoteSha = remoteLine.split(/\s+/)[0] || '';

const containers = parseLines(run('docker', [
  'ps',
  '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
  '--format', '{{json .}}'
]));
const services = containers.map((container) => ({
  name: String(container.Labels || '').split(',').find((label) => label.startsWith('com.docker.compose.service='))?.split('=')[1] || '',
  health: container.HealthStatus,
  ports: container.Ports || ''
}));
const service = (name) => services.find((item) => item.name === name);
const frontendBinding = /127\.0\.0\.1:3300->80\/tcp/.test(service('frontend')?.ports || '') ? '127.0.0.1:3300' : null;
const publishedPortCount = (name) => (service(name)?.ports || '').split(',').filter((entry) => /->/.test(entry)).length;

const smokeChecks = await Promise.all([
  ['/health', 200],
  ['/api/readiness', 200],
  ['/api/items', 401]
].map(async ([route, expected]) => {
  try {
    const response = await fetch(`http://127.0.0.1:3300${route}`, { signal: AbortSignal.timeout(5000) });
    await response.arrayBuffer();
    return response.status === expected;
  } catch {
    return false;
  }
}));

const databaseId = run('docker', [
  'ps', '-q',
  '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
  '--filter', 'label=com.docker.compose.service=database'
]);
const databaseCounts = run('docker', [
  'exec', databaseId, 'psql', '-U', 'seowon', '-d', 'seowon_inventory', '-Atc',
  "select count(*) from schema_migrations; select count(*) from users;"
]).split(/\r?\n/).map(Number);

const backupDir = path.join(projectDir, 'artifacts', 'backups');
const backupManifestPath = fs.readdirSync(backupDir)
  .filter((name) => /^seowon-inventory-.*\.dump\.json$/.test(name))
  .map((name) => path.join(backupDir, name))
  .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
const backupManifest = JSON.parse(fs.readFileSync(backupManifestPath, 'utf8'));

const listenerJson = run('powershell.exe', [
  '-NoProfile', '-NonInteractive', '-Command',
  "Get-NetTCPConnection -State Listen -LocalPort 1234,11434,18765,18766 -ErrorAction Stop | Select-Object LocalPort,OwningProcess | ConvertTo-Json -Compress"
]);
const listeners = JSON.parse(listenerJson);
const listenerList = Array.isArray(listeners) ? listeners : [listeners];
const expectedListeners = new Map([[1234, 6632], [11434, 8588], [18765, 22716], [18766, 65724]]);
const protectedServicesPreserved = [...expectedListeners].every(([port, pid]) => listenerList.some((listener) => listener.LocalPort === port && listener.OwningProcess === pid));

let dnsPublished = false;
try {
  const [addresses, aliases] = await Promise.allSettled([
    resolve4('inventory.safe-link.co.kr'),
    resolveCname('inventory.safe-link.co.kr')
  ]);
  dnsPublished = (addresses.status === 'fulfilled' && addresses.value.length > 0)
    || (aliases.status === 'fulfilled' && aliases.value.length > 0);
} catch {
  dnsPublished = false;
}

const cloudflared = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const tunnelObservation = observeCloudflareTunnels({ cloudflared, cwd: projectDir });
const tunnels = tunnelObservation.tunnels;
const actualEvidencePath = path.join(projectDir, 'agent docs', 'harness', 'P6_G4_PRODUCTION_CUTOVER_SIGNOFF_EVIDENCE.json');

const observation = {
  now: new Date().toISOString(),
  remoteShaMatched: headSha === remoteSha,
  services,
  frontendBinding,
  backendHostPortCount: publishedPortCount('backend'),
  databaseHostPortCount: publishedPortCount('database'),
  smokePassed: smokeChecks.every(Boolean),
  applicationMigrations: databaseCounts[0],
  productionUsers: databaseCounts[1],
  backupRestoreVerified: backupManifest.restoreVerified === true,
  protectedServicesPreserved,
  tunnelObservationSucceeded: tunnelObservation.succeeded,
  tunnels,
  productionTunnelExists: tunnels.some((tunnel) => tunnel.name === 'sqcm-i-inventory-production' && tunnel.connections > 0),
  dnsPublished,
  actualCutoverEvidenceExists: fs.existsSync(actualEvidencePath)
};
const result = evaluateProductionCutoverPreflight(observation);

console.log(JSON.stringify({
  checkedAt: observation.now,
  status: result.status,
  branch,
  headSha,
  changeWindow: PRODUCTION_CHANGE_WINDOW,
  production: {
    services,
    frontendBinding,
    backendHostPortCount: observation.backendHostPortCount,
    databaseHostPortCount: observation.databaseHostPortCount,
    smokePassed: observation.smokePassed,
    applicationMigrations: observation.applicationMigrations,
    productionUsers: observation.productionUsers,
    backupRestoreVerified: observation.backupRestoreVerified
  },
  publicIngress: {
    hostname: 'inventory.safe-link.co.kr',
    dnsPublished,
    productionTunnelExists: observation.productionTunnelExists,
    existingTunnels: tunnels.map((tunnel) => tunnel.name),
    tunnelObservationStatus: tunnelObservation.status
  },
  protectedServicesPreserved,
  localBlockers: result.localBlockers,
  externalPending: result.externalPending,
  productionGo: result.productionGo
}, null, 2));

process.exitCode = result.localBlockers.length === 0 ? 0 : 1;
