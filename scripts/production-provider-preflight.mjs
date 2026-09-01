import { spawnSync } from 'node:child_process';
import { evaluateProductionProviderPreflight } from '../src/operations/production-provider-preflight.mjs';

const containerQuery = spawnSync('docker', [
  'ps', '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
  '--filter', 'label=com.docker.compose.service=backend', '--format', '{{.ID}}'
], { encoding: 'utf8', windowsHide: true });
if (containerQuery.status !== 0) throw new Error('Unable to locate the Production backend container.');
const containerId = containerQuery.stdout.trim();
if (!/^[a-f0-9]{12,64}$/.test(containerId)) throw new Error('Exactly one Production backend container is required.');

const containerProbe = String.raw`
(async()=>{
  const {getConfig}=require('./src/config');
  const {createPool}=require('./src/db');
  const {loadOperationalAdapters}=require('./src/adapters/loader');
  const config=getConfig();
  const pool=createPool(config.databaseUrl);
  try {
    const adapters=await loadOperationalAdapters(config,{pool});
    const [fileStorage,malware,aiHealth,aiReadiness,eventPublisher]=await Promise.all([
      adapters.fileStore.healthCheck(),
      adapters.malwareScanner.healthCheck(),
      adapters.aiProvider.healthCheck(),
      adapters.aiProvider.readinessCheck(),
      adapters.eventPublisher.healthCheck()
    ]);
    console.log(JSON.stringify({
      fileStorage:{status:fileStorage.status,driver:fileStorage.driver},
      malware:{status:malware.status,driver:malware.driver},
      aiHealth:{status:aiHealth.status},
      aiReadiness:{status:aiReadiness.status},
      eventPublisher:{status:eventPublisher.status,driver:eventPublisher.driver},
      secretMaterialPrinted:false
    }));
  } finally { await pool.end(); }
})().catch(error=>{console.error(JSON.stringify({status:'error',message:error.message}));process.exit(1);});`;

const probe = spawnSync('docker', ['exec', containerId, 'node', '-e', containerProbe], {
  encoding: 'utf8', windowsHide: true, timeout: 150_000, maxBuffer: 1024 * 1024
});
if (probe.status !== 0) throw new Error(`Production provider probe failed: ${probe.stderr.trim() || 'unknown error'}`);
const lines = probe.stdout.trim().split(/\r?\n/).filter(Boolean);
const observation = JSON.parse(lines.at(-1));
const result = evaluateProductionProviderPreflight(observation);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2));
if (result.status !== 'PASS') process.exitCode = 1;
