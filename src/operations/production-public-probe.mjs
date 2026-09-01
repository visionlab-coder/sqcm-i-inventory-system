const EXPECTED_RESPONSES = Object.freeze({
  '/health': 200,
  '/api/health': 200,
  '/api/readiness': 200,
  '/api/items': 401,
  '/assets/seowon-official-logo-reversed.png': 200
});

export function evaluateProductionPublicProbe(observation) {
  if (!observation.dnsPublished) {
    return {
      status: 'READY_WAIT_DNS_TLS_PUBLICATION',
      failures: [],
      pending: ['PUBLIC_DNS_TLS_NOT_PUBLISHED'],
      productionGo: false
    };
  }
  if (!observation.insideWindow) {
    return {
      status: 'FAIL_PUBLICATION_OUTSIDE_CHANGE_WINDOW',
      failures: ['PUBLIC_DNS_PUBLISHED_OUTSIDE_CHANGE_WINDOW'],
      pending: [],
      productionGo: false
    };
  }

  const failures = [];
  for (const [path, expectedStatus] of Object.entries(EXPECTED_RESPONSES)) {
    const actual = observation.responses?.[path];
    if (actual?.status !== expectedStatus) failures.push(`${path} expected ${expectedStatus}, received ${actual?.status ?? 'unreachable'}`);
    if (actual?.tlsVerified !== true) failures.push(`${path} TLS verification missing`);
    if (actual?.finalHostname !== 'inventory.safe-link.co.kr') failures.push(`${path} hostname drift`);
  }

  return {
    status: failures.length === 0 ? 'PASS_PUBLIC_HEALTH_READINESS' : 'FAIL_PUBLIC_HEALTH_READINESS',
    failures,
    pending: [],
    productionGo: false
  };
}

export { EXPECTED_RESPONSES as PRODUCTION_PUBLIC_EXPECTED_RESPONSES };
