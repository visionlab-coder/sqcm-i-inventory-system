const test = require('node:test');
const assert = require('node:assert/strict');

const evidenceModule = import('../../src/operations/production-cutover-evidence.mjs');

const source = () => ({
  g3: { status: 'PASS', source: { candidateSha: 'a'.repeat(40) } },
  g4: { status: 'READY_WAIT_CHANGE_WINDOW', checkedAt: '2026-09-01T14:25:18+09:00' },
  p5: { status: 'PASS_SIGNOFF_3_OF_3', technicalBasis: { passed: 19, uatTotal: 19 } }
});

test('실제 로컬 증거가 있는 cutover Gate 3개만 PASS로 조립한다', async () => {
  const { assembleProductionCutoverEvidence, GATE_IDS } = await evidenceModule;
  const result = assembleProductionCutoverEvidence(source());
  assert.equal(result.localGatePassCount, 3);
  assert.equal(result.pendingGateCount, 9);
  assert.deepEqual(result.gates.filter((gate) => gate.status === 'PASS').map((gate) => gate.id), [
    'artifact', 'backup_restore', 'migration_review'
  ]);
  assert.equal(result.gates.length, GATE_IDS.length);
});

test('Production 역할 결과와 최종 서명을 staging 증거로 승격하지 않는다', async () => {
  const { assembleProductionCutoverEvidence } = await evidenceModule;
  const result = assembleProductionCutoverEvidence(source());
  assert.ok(result.pilot.roleResults.every((entry) => entry.status === 'PENDING'));
  assert.ok(Object.values(result.approvals).every((entry) => entry.status === 'PENDING'));
  assert.equal(result.productionGo, false);
});

test('필수 선행 증거가 PASS가 아니면 후보를 만들지 않는다', async () => {
  const { assembleProductionCutoverEvidence } = await evidenceModule;
  const input = source();
  input.g3.status = 'HOLD';
  assert.throws(() => assembleProductionCutoverEvidence(input), /P6-G3 evidence must be PASS/);
});
