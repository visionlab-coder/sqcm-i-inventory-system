import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { evaluateProductionPublicProbe, PRODUCTION_PUBLIC_EXPECTED_RESPONSES } from '../src/operations/production-public-probe.mjs';
import { runProductionPublicProbeObservation } from '../src/operations/production-public-probe-runtime.mjs';

const hostname = 'inventory.safe-link.co.kr';

async function main() {
  const now = new Date();
  const insideWindow = now >= new Date(PRODUCTION_CHANGE_WINDOW.start)
    && now <= new Date(PRODUCTION_CHANGE_WINDOW.end);
  const observation = await runProductionPublicProbeObservation({
    hostname,
    expectedResponses:PRODUCTION_PUBLIC_EXPECTED_RESPONSES,
    insideWindow
  });
  if (observation.status === 'FAIL_PUBLIC_PROBE_DNS_OBSERVATION') {
    console.error(JSON.stringify({
      checkedAt:now.toISOString(),hostname,insideWindow,
      expectedPaths:Object.keys(PRODUCTION_PUBLIC_EXPECTED_RESPONSES),
      status:observation.status,failures:[observation.dnsObservationStatus],pending:[],
      dnsPublished:false,dnsObservationStatus:observation.dnsObservationStatus,
      endpointObservationStatus:'NOT_RUN',secretValuesReadOrRecorded:false,productionGo:false
    },null,2));
    process.exitCode = 1;
    return;
  }

  const result = evaluateProductionPublicProbe({
    dnsPublished:observation.dnsPublished,
    insideWindow,
    responses:observation.responses
  });
  console.log(JSON.stringify({
    checkedAt:now.toISOString(),hostname,dnsPublished:observation.dnsPublished,insideWindow,
    dnsObservationStatus:observation.dnsObservationStatus,
    endpointObservationStatus:observation.endpointObservationStatus,
    expectedPaths:Object.keys(PRODUCTION_PUBLIC_EXPECTED_RESPONSES),
    secretValuesReadOrRecorded:false,...result
  },null,2));
  if (result.status.startsWith('FAIL_')) process.exitCode = 1;
}

main().catch(() => {
  console.error(JSON.stringify({
    checkedAt:new Date().toISOString(),hostname,
    status:'FAIL_PUBLIC_PROBE_OBSERVATION',failures:['PUBLIC_PROBE_OBSERVATION_FAILED'],
    pending:[],secretValuesReadOrRecorded:false,productionGo:false
  },null,2));
  process.exitCode = 1;
});
