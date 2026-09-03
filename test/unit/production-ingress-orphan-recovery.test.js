const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const publicationModule = import('../../src/operations/production-ingress-publication.mjs');
const runtimeModule = import('../../src/operations/production-ingress-publication-runtime.mjs');
const confirmation = 'ACK-RECOVER-PRODUCTION-INGRESS-ORPHAN';

const emptyState = {
  tunnelObservationSucceeded: true,
  dnsObservationSucceeded: true,
  processObservationSucceeded: true,
  tunnelPresent: false,
  tunnelConnected: false,
  temporaryCredentialPresent: false,
  finalCredentialPresent: false,
  configPresent: false,
  processRunning: false,
  dnsPublished: false
};

const eligibleState = {
  ...emptyState,
  tunnelPresent: true,
  temporaryCredentialPresent: true
};

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-ingress-orphan-recovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('exact orphan 상태만 dry-run 복구 준비가 된다', async () => {
  const { evaluateProductionIngressOrphanRecoveryExecution } = await publicationModule;
  assert.equal(evaluateProductionIngressOrphanRecoveryExecution(eligibleState).status, 'PASS_INGRESS_ORPHAN_RECOVERY_DRY_RUN_READY');
  assert.equal(evaluateProductionIngressOrphanRecoveryExecution({ ...eligibleState, temporaryCredentialPresent: false }).status, 'READY_WAIT_INGRESS_PARTIAL_MUTATION_REVIEW');
  assert.equal(evaluateProductionIngressOrphanRecoveryExecution({ ...eligibleState, tunnelConnected: true }).status, 'READY_WAIT_INGRESS_PARTIAL_MUTATION_REVIEW');
});

test('실제 복구는 변경창과 exact confirmation을 모두 요구한다', async () => {
  const { evaluateProductionIngressOrphanRecoveryExecution } = await publicationModule;
  const outside = evaluateProductionIngressOrphanRecoveryExecution({ ...eligibleState, execute: true, insideWindow: false, confirmation });
  assert.equal(outside.status, 'FAIL_INGRESS_ORPHAN_RECOVERY_OUTSIDE_CHANGE_WINDOW');
  const unconfirmed = evaluateProductionIngressOrphanRecoveryExecution({ ...eligibleState, execute: true, insideWindow: true, confirmation: 'wrong' });
  assert.equal(unconfirmed.status, 'READY_WAIT_INGRESS_ORPHAN_RECOVERY_CONFIRMATION');
  const ready = evaluateProductionIngressOrphanRecoveryExecution({ ...eligibleState, execute: true, insideWindow: true, confirmation });
  assert.equal(ready.status, 'READY_INGRESS_ORPHAN_RECOVERY_EXECUTION');
  assert.equal(ready.externalMutationPerformed, false);
});

test('관측 실패와 완전 게시 상태를 삭제 권한으로 승격하지 않는다', async () => {
  const { evaluateProductionIngressOrphanRecoveryExecution } = await publicationModule;
  assert.equal(evaluateProductionIngressOrphanRecoveryExecution({ ...eligibleState, tunnelObservationSucceeded: false }).status, 'FAIL_INGRESS_ORPHAN_RECOVERY_OBSERVATION');
  const completeInput = {
    ...emptyState,
    tunnelPresent: true,
    tunnelConnected: true,
    finalCredentialPresent: true,
    configPresent: true,
    processRunning: true,
    dnsPublished: true
  };
  const complete = evaluateProductionIngressOrphanRecoveryExecution(completeInput);
  assert.equal(complete.status, 'PASS_INGRESS_PUBLICATION_COMPLETE_NOT_ORPHANED');
  const routeDisabled = { ...completeInput, dnsPublished: false };
  assert.equal(evaluateProductionIngressOrphanRecoveryExecution(routeDisabled).status, 'PASS_INGRESS_ROUTE_DISABLED_NOT_ORPHANED');
  assert.equal(evaluateProductionIngressOrphanRecoveryExecution(routeDisabled).recoveryRequired, false);
});

test('삭제 대상이 전혀 없으면 unrelated process metadata 부재를 복구 실패로 승격하지 않는다', async () => {
  const { evaluateProductionIngressOrphanRecoveryExecution } = await publicationModule;
  const result = evaluateProductionIngressOrphanRecoveryExecution({ ...emptyState, processObservationSucceeded: false });
  assert.equal(result.status, 'PASS_NO_INGRESS_RECOVERY_TARGET_PROCESS_UNOBSERVED');
  assert.equal(result.processObservationComplete, false);
  assert.equal(result.recoveryRequired, false);
});

test('임시 credential은 원문 read 없이 동일 physical identity일 때만 삭제한다', async (t) => {
  const { inspectProductionIngressTemporaryCredential, removeProductionIngressTemporaryCredential } = await runtimeModule;
  const root = fixture(t);
  const temporary = path.join(root, 'sqcm-i-inventory-production.json.tmp');
  fs.writeFileSync(temporary, '{"secret":"not-read"}\n', { flag: 'wx', mode: 0o600 });
  let reads = 0;
  const io = { ...fs, readFileSync() { reads += 1; throw new Error('SECRET_BODY_READ'); } };
  const snapshot = inspectProductionIngressTemporaryCredential({ credentialDirectory: root, temporaryPath: temporary, io });
  assert.equal(snapshot.present, true);
  assert.equal(removeProductionIngressTemporaryCredential(snapshot, { io }), true);
  assert.equal(reads, 0);
  assert.equal(fs.existsSync(temporary), false);
});

test('검사 뒤 교체된 임시 credential은 삭제하지 않는다', async (t) => {
  const { inspectProductionIngressTemporaryCredential, removeProductionIngressTemporaryCredential } = await runtimeModule;
  const root = fixture(t);
  const temporary = path.join(root, 'sqcm-i-inventory-production.json.tmp');
  fs.writeFileSync(temporary, '{"secret":"first"}\n', { flag: 'wx', mode: 0o600 });
  const snapshot = inspectProductionIngressTemporaryCredential({ credentialDirectory: root, temporaryPath: temporary });
  fs.appendFileSync(temporary, ' ');
  assert.throws(() => removeProductionIngressTemporaryCredential(snapshot), /INGRESS_TEMPORARY_CREDENTIAL_STATE_UNSTABLE/);
  assert.equal(fs.existsSync(temporary), true);
});

test('복구 진입점은 no-force exact UUID delete 후 원격 부재를 확인하고 credential을 제거한다', () => {
  const root = path.join(__dirname, '../..');
  const script = fs.readFileSync(path.join(root, 'scripts/production-ingress-orphan-recovery.mjs'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const harness = fs.readFileSync(path.join(root, 'scripts/goal-harness.mjs'), 'utf8');
  assert.equal(pkg.scripts['production:ingress-orphan-recovery'], 'node scripts/production-ingress-orphan-recovery.mjs');
  assert.match(harness, /production-ingress-orphan-recovery/);
  const deletion = script.indexOf("['tunnel', 'delete', current.tunnel.id]");
  const absent = script.indexOf('selectedTunnel()', deletion);
  const localRemoval = script.indexOf('removeProductionIngressTemporaryCredential', absent);
  assert.ok(deletion >= 0 && absent > deletion && localRemoval > absent);
  assert.doesNotMatch(script, /--force|'-f'/);
  assert.match(script, /PRODUCTION_INGRESS_ORPHAN_RECOVERY_CONFIRMATION/);
  assert.match(script, /secretValuesReadOrRecorded:\s*false/);
});

test('orphan 복구 confirmation은 변경창 입력 Gate에서 사전 무장을 금지한다', async () => {
  const { MUTATING_CONFIRMATION_NAMES } = await import('../../src/operations/production-change-window-input-readiness.mjs');
  assert.ok(MUTATING_CONFIRMATION_NAMES.includes('PRODUCTION_INGRESS_ORPHAN_RECOVERY_CONFIRMATION'));
});
