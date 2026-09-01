const EXPECTED = Object.freeze({
  fileStorage: { status: 'ok', driver: 'POSTGRES' },
  malware: { status: 'ok', driver: 'MICROSOFT_DEFENDER_BRIDGE' },
  aiHealth: { status: 'ok' },
  aiReadiness: { status: 'ready' },
  eventPublisher: { status: 'ok', driver: 'HTTP_LOOPBACK' }
});

export function evaluateProductionProviderPreflight(observation) {
  const failures = [];
  for (const [provider, expected] of Object.entries(EXPECTED)) {
    const actual = observation?.[provider];
    if (!actual || Object.entries(expected).some(([key, value]) => actual[key] !== value)) {
      failures.push(`${provider.toUpperCase()}_NOT_READY`);
    }
  }
  if (observation?.secretMaterialPrinted === true) failures.push('SECRET_MATERIAL_EXPOSED');

  return {
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
    providers: Object.fromEntries(Object.entries(EXPECTED).map(([provider]) => [provider, observation?.[provider] || null])),
    readOnly: true,
    productionGo: false
  };
}

export { EXPECTED as PRODUCTION_PROVIDER_EXPECTED };
