export const PUBLIC_ROLE_SMOKE_CONFIRMATION = 'ACK-2026-09-03-PUBLIC-ROLE-SMOKE';

export function selectProductionRoleSmokeTarget({
  publicMode = false,
  now,
  windowStart,
  windowEnd,
  confirmation
}) {
  if (!publicMode) {
    return {
      status: 'READY_LOOPBACK_ROLE_SMOKE_BASELINE',
      target: 'http://127.0.0.1:3300',
      targetKind: 'loopback',
      actualProductionGate: false
    };
  }
  if (now < windowStart || now > windowEnd) {
    return {
      status: 'FAIL_PUBLIC_ROLE_SMOKE_OUTSIDE_CHANGE_WINDOW',
      target: null,
      targetKind: 'production-https',
      actualProductionGate: false
    };
  }
  if (confirmation !== PUBLIC_ROLE_SMOKE_CONFIRMATION) {
    return {
      status: 'READY_WAIT_PUBLIC_ROLE_SMOKE_CONFIRMATION',
      target: null,
      targetKind: 'production-https',
      actualProductionGate: false
    };
  }
  return {
    status: 'READY_PUBLIC_ROLE_SMOKE_EXECUTION',
    target: 'https://inventory.safe-link.co.kr',
    targetKind: 'production-https',
    actualProductionGate: true
  };
}

export function classifyRoleSmokeEvidence(evaluation, actualProductionGate) {
  if (evaluation.failures.length) {
    return { ...evaluation, actualRoleCoreSmoke: 'FAIL' };
  }
  if (!actualProductionGate) {
    return {
      status: 'PASS_LOOPBACK_ROLE_CORE_SMOKE_BASELINE',
      failures: [],
      actualRoleCoreSmoke: 'NOT_RUN',
      productionGo: false
    };
  }
  return {
    status: 'PASS_PRODUCTION_ROLE_CORE_SMOKE',
    failures: [],
    actualRoleCoreSmoke: 'PASS',
    productionGo: false
  };
}
