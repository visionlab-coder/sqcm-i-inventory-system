export const PUBLIC_NONFUNCTIONAL_CONFIRMATION = 'ACK-2026-09-03-PUBLIC-NONFUNCTIONAL';

export function selectProductionNonfunctionalTarget({
  publicMode = false,
  now,
  windowStart,
  windowEnd,
  confirmation
}) {
  if (!publicMode) {
    return {
      status: 'READY_LOOPBACK_BASELINE',
      target: 'http://127.0.0.1:3300',
      allowRemote: false,
      actualPublicGate: false
    };
  }
  if (now < windowStart || now > windowEnd) {
    return {
      status: 'FAIL_PUBLIC_NONFUNCTIONAL_OUTSIDE_CHANGE_WINDOW',
      target: null,
      allowRemote: false,
      actualPublicGate: false
    };
  }
  if (confirmation !== PUBLIC_NONFUNCTIONAL_CONFIRMATION) {
    return {
      status: 'READY_WAIT_PUBLIC_NONFUNCTIONAL_CONFIRMATION',
      target: null,
      allowRemote: false,
      actualPublicGate: false
    };
  }
  return {
    status: 'READY_PUBLIC_NONFUNCTIONAL_EXECUTION',
    target: 'https://inventory.safe-link.co.kr',
    allowRemote: true,
    actualPublicGate: true
  };
}
