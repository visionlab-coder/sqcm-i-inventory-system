const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runtimeModule = import('../../src/operations/production-ingress-publication-runtime.mjs');
const confirmation = 'ACK-RECOVER-PRODUCTION-INGRESS-LEASE';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-ingress-lease-recovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

async function staleLease(t, processId = 9510) {
  const { acquireProductionIngressPublicationLease } = await runtimeModule;
  const root = fixture(t);
  const lease = acquireProductionIngressPublicationLease({
    runtimeDirectory: root,
    processId,
    leaseId: '77777777-7777-4777-8777-777777777777',
    checkedAt: '2026-09-03T01:00:00.000Z'
  });
  return { root, lease };
}

test('active owner 또는 최소 stale age 미달 lease는 복구하지 않는다', async (t) => {
  const { recoverProductionIngressPublicationLease } = await runtimeModule;
  assert.equal(typeof recoverProductionIngressPublicationLease, 'function');
  const { root, lease } = await staleLease(t);
  const active = recoverProductionIngressPublicationLease({
    runtimeDirectory: root,
    checkedAt: '2026-09-03T01:10:00.000Z',
    processExists: () => true
  });
  assert.equal(active.status, 'READY_WAIT_INGRESS_PUBLICATION_LEASE_OWNER_ACTIVE');
  const recent = recoverProductionIngressPublicationLease({
    runtimeDirectory: root,
    checkedAt: '2026-09-03T01:01:00.000Z',
    processExists: () => false
  });
  assert.equal(recent.status, 'READY_WAIT_INGRESS_PUBLICATION_LEASE_NOT_STALE');
  assert.equal(fs.existsSync(lease.path), true);
});

test('stale inactive lease dry-run은 삭제 없이 복구 준비만 보고한다', async (t) => {
  const { recoverProductionIngressPublicationLease } = await runtimeModule;
  const { root, lease } = await staleLease(t);
  const result = recoverProductionIngressPublicationLease({
    runtimeDirectory: root,
    checkedAt: '2026-09-03T01:10:00.000Z',
    processExists: () => false
  });
  assert.equal(result.status, 'PASS_INGRESS_PUBLICATION_LEASE_RECOVERY_DRY_RUN_READY');
  assert.equal(result.externalMutationPerformed, false);
  assert.equal(fs.existsSync(lease.path), true);
});

test('execute는 변경창과 exact confirmation 없이는 stale lease를 삭제하지 않는다', async (t) => {
  const { recoverProductionIngressPublicationLease } = await runtimeModule;
  const { root, lease } = await staleLease(t);
  const outside = recoverProductionIngressPublicationLease({
    runtimeDirectory: root,
    execute: true,
    insideWindow: false,
    confirmation,
    checkedAt: '2026-09-03T01:10:00.000Z',
    processExists: () => false
  });
  assert.equal(outside.status, 'FAIL_INGRESS_PUBLICATION_LEASE_RECOVERY_OUTSIDE_CHANGE_WINDOW');
  const unconfirmed = recoverProductionIngressPublicationLease({
    runtimeDirectory: root,
    execute: true,
    insideWindow: true,
    confirmation: 'wrong',
    checkedAt: '2026-09-03T01:10:00.000Z',
    processExists: () => false
  });
  assert.equal(unconfirmed.status, 'READY_WAIT_INGRESS_PUBLICATION_LEASE_RECOVERY_CONFIRMATION');
  assert.equal(fs.existsSync(lease.path), true);
});

test('변경창의 exact confirmation은 stale inactive owner의 안정된 lease만 삭제한다', async (t) => {
  const { recoverProductionIngressPublicationLease } = await runtimeModule;
  const { root, lease } = await staleLease(t);
  const result = recoverProductionIngressPublicationLease({
    runtimeDirectory: root,
    execute: true,
    insideWindow: true,
    confirmation,
    checkedAt: '2026-09-03T01:10:00.000Z',
    processExists: () => false
  });
  assert.equal(result.status, 'PASS_INGRESS_PUBLICATION_LEASE_RECOVERED');
  assert.equal(result.externalMutationPerformed, true);
  assert.equal(fs.existsSync(lease.path), false);
});

test('검사 뒤 교체된 lease는 삭제하지 않고 unstable로 차단한다', async (t) => {
  const { recoverProductionIngressPublicationLease } = await runtimeModule;
  const { root, lease } = await staleLease(t);
  let leaseStats = 0;
  const io = {
    ...fs,
    lstatSync(candidate) {
      if (path.resolve(candidate).toLowerCase() === path.resolve(lease.path).toLowerCase()) {
        leaseStats += 1;
        if (leaseStats === 2) fs.appendFileSync(lease.path, ' ');
      }
      return fs.lstatSync(candidate);
    }
  };
  assert.throws(
    () => recoverProductionIngressPublicationLease({
      runtimeDirectory: root,
      execute: true,
      insideWindow: true,
      confirmation,
      checkedAt: '2026-09-03T01:10:00.000Z',
      processExists: () => false,
      io
    }),
    /INGRESS_PUBLICATION_LEASE_STATE_UNSTABLE/
  );
  assert.equal(fs.existsSync(lease.path), true);
});

test('복구 진입점과 npm 명령은 dry-run을 기본값으로 유지한다', () => {
  const script = fs.readFileSync(path.join(__dirname, '../../scripts/production-ingress-lease-recovery.mjs'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
  assert.equal(pkg.scripts['production:ingress-lease-recovery'], 'node scripts/production-ingress-lease-recovery.mjs');
  assert.match(script, /process\.argv\.includes\('--execute'\)/);
  assert.match(script, /PRODUCTION_INGRESS_LEASE_RECOVERY_CONFIRMATION/);
  assert.match(script, /PRODUCTION_CHANGE_WINDOW/);
  assert.match(script, /secretValuesReadOrRecorded:\s*false/);
});
