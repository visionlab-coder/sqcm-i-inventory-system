const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runtimeModule = import('../../src/operations/production-ingress-publication-runtime.mjs');
const entrypoint = fs.readFileSync(
  path.join(__dirname, '../../scripts/production-ingress-publication.mjs'),
  'utf8'
);

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-ingress-output-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('ingress config는 fsync 후 hard-link no-replace로 게시한다', async (t) => {
  const { writeProductionIngressConfigCreateOnly } = await runtimeModule;
  assert.equal(typeof writeProductionIngressConfigCreateOnly, 'function');
  const root = fixture(t);
  const output = path.join(root, 'cloudflared.yml');
  writeProductionIngressConfigCreateOnly({
    runtimeDirectory: root,
    configPath: output,
    content: 'tunnel: candidate\n',
    processId: 9301
  });
  assert.equal(fs.readFileSync(output, 'utf8'), 'tunnel: candidate\n');
  assert.equal(fs.existsSync(path.join(root, '.cloudflared.yml.9301.tmp')), false);
});

test('ingress config 경쟁은 선점 bytes를 보존하고 내부 임시파일을 제거한다', async (t) => {
  const { writeProductionIngressConfigCreateOnly } = await runtimeModule;
  assert.equal(typeof writeProductionIngressConfigCreateOnly, 'function');
  const root = fixture(t);
  const output = path.join(root, 'cloudflared.yml');
  const realLink = fs.linkSync.bind(fs);
  const io = {
    ...fs,
    linkSync(source, destination) {
      fs.writeFileSync(destination, 'tunnel: competing\n', { flag: 'wx' });
      return realLink(source, destination);
    }
  };
  assert.throws(
    () => writeProductionIngressConfigCreateOnly({
      runtimeDirectory: root,
      configPath: output,
      content: 'tunnel: candidate\n',
      processId: 9302,
      io
    }),
    /INGRESS_CONFIG_ALREADY_EXISTS/
  );
  assert.equal(fs.readFileSync(output, 'utf8'), 'tunnel: competing\n');
  assert.equal(fs.existsSync(path.join(root, '.cloudflared.yml.9302.tmp')), false);
});

test('tunnel credential은 원문 read 없이 fsync 후 hard-link no-replace로 게시한다', async (t) => {
  const { publishProductionTunnelCredential } = await runtimeModule;
  assert.equal(typeof publishProductionTunnelCredential, 'function');
  const root = fixture(t);
  const temporary = path.join(root, 'sqcm-i-inventory-production.json.tmp');
  const final = path.join(root, '11111111-1111-4111-8111-111111111111.json');
  fs.writeFileSync(temporary, '{"secret":"must-not-be-read"}\n', { flag: 'wx', mode: 0o600 });
  let reads = 0;
  const io = { ...fs, readFileSync() { reads += 1; throw new Error('SECRET_BODY_READ'); } };
  publishProductionTunnelCredential({
    credentialDirectory: root,
    temporaryPath: temporary,
    finalPath: final,
    io
  });
  assert.equal(reads, 0);
  assert.equal(fs.existsSync(temporary), false);
  assert.equal(fs.statSync(final).size, 30);
});

test('credential 경쟁은 선점 bytes와 복구용 생성 credential을 모두 보존한다', async (t) => {
  const { publishProductionTunnelCredential } = await runtimeModule;
  assert.equal(typeof publishProductionTunnelCredential, 'function');
  const root = fixture(t);
  const temporary = path.join(root, 'sqcm-i-inventory-production.json.tmp');
  const final = path.join(root, '22222222-2222-4222-8222-222222222222.json');
  const generated = '{"secret":"generated"}\n';
  const competing = '{"owner":"competing"}\n';
  fs.writeFileSync(temporary, generated, { flag: 'wx', mode: 0o600 });
  const realLink = fs.linkSync.bind(fs);
  const io = {
    ...fs,
    linkSync(source, destination) {
      fs.writeFileSync(destination, competing, { flag: 'wx', mode: 0o600 });
      return realLink(source, destination);
    }
  };
  assert.throws(
    () => publishProductionTunnelCredential({
      credentialDirectory: root,
      temporaryPath: temporary,
      finalPath: final,
      io
    }),
    /INGRESS_CREDENTIAL_ALREADY_EXISTS/
  );
  assert.equal(fs.readFileSync(final, 'utf8'), competing);
  assert.equal(fs.readFileSync(temporary, 'utf8'), generated);
});

test('provider tunnel 생성 성공은 mutation 기록 뒤 원격 재관측과 Secret-free 확인 전에는 credential을 게시하지 않는다', () => {
  const command = entrypoint.indexOf("runCloudflared(['tunnel', 'create'");
  const marked = entrypoint.indexOf('tunnelCreated = true;', command);
  const observed = entrypoint.indexOf('observedCreatedTunnel = selectedTunnel()', command);
  const acknowledged = entrypoint.indexOf('acknowledgeProductionIngressTunnelCreation({', command);
  const published = entrypoint.indexOf('publishProductionTunnelCredential({', command);
  assert.ok(command >= 0 && marked > command);
  assert.ok(marked < observed && observed < acknowledged && acknowledged < published);
  assert.equal(entrypoint.indexOf('JSON.parse(createOutput)', command), -1);
});

test('ingress publication lease는 동시 두 번째 실행을 차단하고 정상 해제 뒤 재개한다', async (t) => {
  const { acquireProductionIngressPublicationLease, releaseProductionIngressPublicationLease } = await runtimeModule;
  assert.equal(typeof acquireProductionIngressPublicationLease, 'function');
  assert.equal(typeof releaseProductionIngressPublicationLease, 'function');
  const root = fixture(t);
  const first = acquireProductionIngressPublicationLease({
    runtimeDirectory: root,
    processId: 9401,
    leaseId: '11111111-1111-4111-8111-111111111111',
    checkedAt: '2026-09-11T11:00:00.000Z'
  });
  assert.throws(
    () => acquireProductionIngressPublicationLease({
      runtimeDirectory: root,
      processId: 9402,
      leaseId: '22222222-2222-4222-8222-222222222222',
      checkedAt: '2026-09-11T11:00:01.000Z'
    }),
    /INGRESS_PUBLICATION_LEASE_HELD/
  );
  assert.equal(releaseProductionIngressPublicationLease(first), true);
  const resumed = acquireProductionIngressPublicationLease({
    runtimeDirectory: root,
    processId: 9403,
    leaseId: '33333333-3333-4333-8333-333333333333',
    checkedAt: '2026-09-11T11:00:02.000Z'
  });
  assert.equal(releaseProductionIngressPublicationLease(resumed), true);
});

test('다른 owner와 stale ingress lease는 자동 삭제하지 않는다', async (t) => {
  const { acquireProductionIngressPublicationLease, releaseProductionIngressPublicationLease } = await runtimeModule;
  assert.equal(typeof acquireProductionIngressPublicationLease, 'function');
  assert.equal(typeof releaseProductionIngressPublicationLease, 'function');
  const root = fixture(t);
  const lease = acquireProductionIngressPublicationLease({
    runtimeDirectory: root,
    processId: 9410,
    leaseId: '44444444-4444-4444-8444-444444444444',
    checkedAt: '2026-09-11T11:00:00.000Z'
  });
  assert.throws(
    () => releaseProductionIngressPublicationLease({ ...lease, leaseId: '55555555-5555-4555-8555-555555555555' }),
    /INGRESS_PUBLICATION_LEASE_OWNERSHIP_MISMATCH/
  );
  assert.equal(fs.existsSync(lease.path), true);
  assert.throws(
    () => acquireProductionIngressPublicationLease({
      runtimeDirectory: root,
      processId: 9411,
      leaseId: '66666666-6666-4666-8666-666666666666',
      checkedAt: '2026-09-12T11:00:00.000Z'
    }),
    /INGRESS_PUBLICATION_LEASE_HELD/
  );
  assert.equal(fs.existsSync(lease.path), true);
  assert.equal(releaseProductionIngressPublicationLease(lease), true);
});

test('실행 진입점은 tunnel 생성 전에 lease를 획득하고 모든 종료 경로에서 해제한다', () => {
  const acquired = entrypoint.indexOf('acquireProductionIngressPublicationLease({');
  const command = entrypoint.indexOf("runCloudflared(['tunnel', 'create'");
  const released = entrypoint.indexOf('releaseProductionIngressPublicationLease(lease)');
  assert.ok(acquired >= 0 && acquired < command);
  assert.ok(released > acquired);
  assert.match(entrypoint, /INGRESS_PUBLICATION_LEASE_HELD/);
  assert.match(entrypoint, /READY_WAIT_INGRESS_PUBLICATION_LEASE/);
});
