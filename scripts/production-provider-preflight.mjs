import { evaluateProductionProviderPreflight } from '../src/operations/production-provider-preflight.mjs';
import {
  parseProductionProviderContainerId,
  parseProductionProviderObservation,
  runProductionProviderPreflightProcess
} from '../src/operations/production-provider-preflight-runtime.mjs';

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
})().catch(()=>{console.error(JSON.stringify({status:'error'}));process.exit(1);});`;

async function main() {
  const containerQuery = runProductionProviderPreflightProcess([
    'ps', '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
    '--filter', 'label=com.docker.compose.service=backend', '--format', '{{.ID}}'
  ]);
  const containerId = parseProductionProviderContainerId(containerQuery.stdout);
  const probe = runProductionProviderPreflightProcess(
    ['exec', containerId, 'node', '-e', containerProbe],
    { timeoutMs: 150_000 }
  );
  const observation = parseProductionProviderObservation(probe.stdout);
  const result = evaluateProductionProviderPreflight(observation);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  const failure = /^PROVIDER_PREFLIGHT_[A-Z_]+$/.test(error?.message)
    ? error.message
    : 'PROVIDER_PREFLIGHT_RUNTIME_FAILED';
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    status: 'FAIL_PROVIDER_PREFLIGHT_RUNTIME',
    failures: [failure],
    readOnly: true,
    secretValuesReadOrRecorded: false,
    productionGo: false
  }, null, 2));
  process.exitCode = 1;
});
