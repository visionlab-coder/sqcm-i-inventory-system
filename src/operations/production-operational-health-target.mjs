export const PUBLIC_OPERATIONAL_HEALTH_CONFIRMATION = 'ACK-2026-09-11-PUBLIC-OPERATIONAL-HEALTH';

export function selectProductionOperationalHealthTarget({
  publicMode = false,
  now,
  windowStart,
  windowEnd,
  confirmation
}) {
  if (!publicMode) {
    return {
      status: 'READY_LOOPBACK_OPERATIONAL_BASELINE',
      target: 'http://127.0.0.1:3300',
      actualPostCutoverGate: false
    };
  }
  if (now < windowStart || now > windowEnd) {
    return {
      status: 'FAIL_PUBLIC_OPERATIONAL_HEALTH_OUTSIDE_CHANGE_WINDOW',
      target: null,
      actualPostCutoverGate: false
    };
  }
  if (confirmation !== PUBLIC_OPERATIONAL_HEALTH_CONFIRMATION) {
    return {
      status: 'READY_WAIT_PUBLIC_OPERATIONAL_HEALTH_CONFIRMATION',
      target: null,
      actualPostCutoverGate: false
    };
  }
  return {
    status: 'READY_PUBLIC_OPERATIONAL_HEALTH_EXECUTION',
    target: 'https://inventory.safe-link.co.kr',
    actualPostCutoverGate: true
  };
}
