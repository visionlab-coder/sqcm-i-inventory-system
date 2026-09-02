const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicationModule = import('../../src/operations/production-ingress-publication.mjs');

const emptyState = {
  tunnelObservationSucceeded: true,
  dnsObservationSucceeded: true,
  tunnelPresent: false,
  temporaryCredentialPresent: false,
  finalCredentialPresent: false,
  configPresent: false,
  processRunning: false,
  dnsPublished: false
};

test('외부 관측 실패는 orphan 없음으로 오판하지 않고 fail-closed 한다', async () => {
  const { evaluateProductionIngressOrphanRecoveryPreflight } = await publicationModule;
  const result = evaluateProductionIngressOrphanRecoveryPreflight({
    ...emptyState,
    tunnelObservationSucceeded: false
  });
  assert.equal(result.status, 'FAIL_INGRESS_ORPHAN_RECOVERY_OBSERVATION');
  assert.equal(result.recoveryRequired, false);
  assert.equal(result.externalMutationPerformed, false);
});

test('아무 ingress 산출물이 없으면 복구 불필요를 증명한다', async () => {
  const { evaluateProductionIngressOrphanRecoveryPreflight } = await publicationModule;
  const result = evaluateProductionIngressOrphanRecoveryPreflight(emptyState);
  assert.equal(result.status, 'PASS_NO_INGRESS_PARTIAL_STATE');
  assert.equal(result.recoveryRequired, false);
});

test('터널 또는 임시 credential만 남은 부분 변경은 수동 복구 검토로 차단한다', async () => {
  const { evaluateProductionIngressOrphanRecoveryPreflight } = await publicationModule;
  for (const partial of [
    { tunnelPresent: true },
    { temporaryCredentialPresent: true },
    { tunnelPresent: true, temporaryCredentialPresent: true }
  ]) {
    const result = evaluateProductionIngressOrphanRecoveryPreflight({ ...emptyState, ...partial });
    assert.equal(result.status, 'READY_WAIT_INGRESS_PARTIAL_MUTATION_REVIEW');
    assert.equal(result.recoveryRequired, true);
    assert.equal(result.externalMutationPerformed, false);
    assert.equal(result.productionGo, false);
  }
});

test('완전 게시된 ingress는 orphan으로 분류하지 않는다', async () => {
  const { evaluateProductionIngressOrphanRecoveryPreflight } = await publicationModule;
  const result = evaluateProductionIngressOrphanRecoveryPreflight({
    ...emptyState,
    tunnelPresent: true,
    finalCredentialPresent: true,
    configPresent: true,
    processRunning: true,
    dnsPublished: true
  });
  assert.equal(result.status, 'PASS_INGRESS_PUBLICATION_COMPLETE_NOT_ORPHANED');
  assert.equal(result.recoveryRequired, false);
});

test('복구 preflight 진입점은 읽기 전용이며 Harness 검증에 등록된다', () => {
  const root = path.join(__dirname, '../..');
  const script = fs.readFileSync(path.join(root, 'scripts/production-ingress-orphan-recovery-preflight.mjs'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const harness = fs.readFileSync(path.join(root, 'scripts/goal-harness.mjs'), 'utf8');
  assert.equal(pkg.scripts['production:ingress-orphan-recovery-preflight'], 'node scripts/production-ingress-orphan-recovery-preflight.mjs');
  assert.match(harness, /production-ingress-orphan-recovery-preflight/);
  assert.match(script, /secretValuesReadOrRecorded:\s*false/);
  assert.doesNotMatch(script, /--execute|unlinkSync|rmSync|tunnel',\s*'delete|dns_records\/.*DELETE/);
});
