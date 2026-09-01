const test = require('node:test');
const assert = require('node:assert/strict');
const finalizerModule = import('../../src/operations/production-cutover-finalizer.mjs');

const gateIds = [
  'artifact', 'backup_restore', 'migration_review', 'provider_preflight',
  'health_readiness', 'core_smoke', 'logs_5xx', 'rollback',
  'csrf_idempotency', 'operational_health', 'nonfunctional', 'uat_signoff'
];

function actualEvidence() {
  return {
    schemaVersion: 1,
    template: false,
    activationState: 'actual',
    releaseTag: 'sha-0123456789abcdef0123456789abcdef01234567',
    targetUrl: 'https://inventory.safe-link.co.kr',
    gates: gateIds.map((id) => ({ id, status: 'PASS', evidence: `production ${id} receipt 2026-09-11` })),
    pilot: {
      openCriticalDefects: 0,
      openHighDefects: 0,
      roleResults: ['employee', 'manager', 'admin'].map((role) => ({ role, status: 'PASS', evidence: `production ${role} UAT receipt` }))
    },
    approvals: Object.fromEntries(['business', 'security', 'operations'].map((role) => [role, {
      status: 'APPROVED',
      signedBy: `${role}-owner`,
      signedAt: '2026-09-11T22:30:00+09:00',
      evidence: `production ${role} approval receipt`
    }])),
    productionGo: true
  };
}

test('12개 Gate·역할 UAT·3개 서명의 실제 Production 증거만 PASS한다', async () => {
  const { validateActualCutoverProvenance } = await finalizerModule;
  const result = validateActualCutoverProvenance(actualEvidence());
  assert.equal(result.status, 'PASS_ACTUAL_CUTOVER_EVIDENCE');
  assert.equal(result.requiredGateCount, 12);
  assert.equal(result.productionGo, true);
});

test('Gate가 하나뿐인 불완전한 actual 증거를 거부한다', async () => {
  const { validateActualCutoverProvenance } = await finalizerModule;
  const evidence = actualEvidence();
  evidence.gates = evidence.gates.slice(0, 1);
  const result = validateActualCutoverProvenance(evidence);
  assert.equal(result.status, 'FAIL_ACTUAL_CUTOVER_EVIDENCE');
  assert.ok(result.failures.includes('EXACT_12_UNIQUE_GATES_REQUIRED'));
});

test('중복 Gate와 예상 밖 Gate를 거부한다', async () => {
  const { validateActualCutoverProvenance } = await finalizerModule;
  const evidence = actualEvidence();
  evidence.gates[11] = { id: 'unexpected', status: 'PASS', evidence: 'production unexpected receipt' };
  const result = validateActualCutoverProvenance(evidence);
  assert.ok(result.failures.includes('unexpected_UNEXPECTED_GATE'));
  assert.match(result.failures.join(','), /uat_signoff/);
});

test('staging·loopback 기준선과 역할·서명 provenance 승격을 거부한다', async () => {
  const { validateActualCutoverProvenance } = await finalizerModule;
  const evidence = actualEvidence();
  evidence.gates.find((gate) => gate.id === 'core_smoke').evidence = 'staging loopback baseline';
  evidence.pilot.roleResults[0].evidence = 'staging employee UAT';
  evidence.approvals.operations.evidence = 'template approval';
  const result = validateActualCutoverProvenance(evidence);
  assert.ok(result.failures.includes('core_smoke_NON_PRODUCTION_EVIDENCE'));
  assert.ok(result.failures.includes('employee_NON_PRODUCTION_ROLE_EVIDENCE'));
  assert.ok(result.failures.includes('operations_NON_PRODUCTION_APPROVAL_EVIDENCE'));
});

test('actual 상태·정확한 URL·불변 SHA·Production GO를 강제한다', async () => {
  const { validateActualCutoverProvenance } = await finalizerModule;
  const evidence = actualEvidence();
  evidence.activationState = 'candidate';
  evidence.targetUrl = 'https://staging.example.com';
  evidence.releaseTag = 'latest';
  evidence.productionGo = false;
  const result = validateActualCutoverProvenance(evidence);
  assert.ok(result.failures.includes('ACTIVATION_STATE_NOT_ACTUAL'));
  assert.ok(result.failures.includes('PRODUCTION_TARGET_URL_MISMATCH'));
  assert.ok(result.failures.includes('IMMUTABLE_RELEASE_TAG_REQUIRED'));
  assert.ok(result.failures.includes('PRODUCTION_GO_NOT_CONFIRMED'));
});
