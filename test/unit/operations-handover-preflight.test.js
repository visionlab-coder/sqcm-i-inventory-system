const test = require('node:test');
const assert = require('node:assert/strict');
const handoverModule = import('../../src/operations/operations-handover-preflight.mjs');

function candidate() {
  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'preflight',
    p7Status: 'not-started',
    productionGo: false,
    domains: {
      slo: { availabilityTargetPercent: 99.5, p95TargetMs: 1000, measurementWindowDays: 30, measurementEvidenceRef: null },
      alerting: { requiredSignals: ['availability', 'latency_p95', 'http_5xx', 'backup_failure', 'certificate_expiry'], receiptEvidenceRef: null, ownerRef: null },
      backup: { rpoMinutes: 1440, retentionDays: 30, offsiteEvidenceRef: null },
      restore: { rtoMinutes: 240, drillEvidenceRef: null },
      certificate: { hostname: 'inventory.safe-link.co.kr', renewalLeadDays: 30, expiryEvidenceRef: null, renewalOwnerRef: null },
      onCall: { primaryOwnerRef: null, escalationOwnerRef: null },
      maintenance: { scheduleContractRef: 'docs/maintenance.md', executionEvidenceRef: null },
      improvementQueue: { queueRef: null, triageOwnerRef: null }
    }
  };
}

test('P6 완료 전에는 P7을 활성화하지 않고 입력을 기다린다', async () => {
  const { evaluateOperationsHandoverPreflight } = await handoverModule;
  const result = evaluateOperationsHandoverPreflight(candidate());
  assert.equal(result.status, 'READY_WAIT_P6_COMPLETION_AND_HANDOVER_INPUTS');
  assert.equal(result.contractErrors.length, 0);
  assert.equal(result.missingInputs.length, 12);
  assert.equal(result.productionGo, false);
});

test('계약 필드가 손상되면 fail-closed 한다', async () => {
  const { evaluateOperationsHandoverPreflight } = await handoverModule;
  const value = candidate();
  value.domains.alerting.requiredSignals = ['availability'];
  const result = evaluateOperationsHandoverPreflight(value);
  assert.equal(result.status, 'BLOCKED_HANDOVER_CONTRACT_INVALID');
  assert.match(result.contractErrors.join(','), /requiredSignals/);
});

test('P7 조기 활성화와 Production GO 승격을 거부한다', async () => {
  const { evaluateOperationsHandoverPreflight } = await handoverModule;
  const value = candidate();
  value.p7Status = 'in-progress';
  value.productionGo = true;
  const result = evaluateOperationsHandoverPreflight(value);
  assert.equal(result.status, 'BLOCKED_HANDOVER_CONTRACT_INVALID');
  assert.equal(result.productionGo, false);
});

test('P6 완료와 모든 참조가 있어야 운영 활성화 입력 준비로 전환한다', async () => {
  const { evaluateOperationsHandoverPreflight } = await handoverModule;
  const value = candidate();
  for (const domain of Object.values(value.domains)) {
    for (const key of Object.keys(domain)) {
      if (key.endsWith('Ref') && domain[key] === null) domain[key] = `evidence://${key}`;
    }
  }
  const result = evaluateOperationsHandoverPreflight(value, { p6EvidenceComplete: true });
  assert.equal(result.status, 'READY_FOR_OPERATIONS_ACTIVATION');
  assert.deepEqual(result.missingInputs, []);
  assert.equal(result.productionGo, false);
});
