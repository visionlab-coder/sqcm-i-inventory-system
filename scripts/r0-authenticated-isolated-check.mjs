// Fresh, synthetic-only three-service environment. Never loads repository .env.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { verifyAuthenticatedBrowser } from './r0-authenticated-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = `sqcm-r0-auth-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const password = randomBytes(24).toString('hex');
const sessionSecret = randomBytes(32).toString('hex');
const mount = (source, target) => ({ type: 'bind', source: path.join(root, source), target, read_only: true });
const spec = {
  services: {
    database: { image: 'postgres:16-alpine', pull_policy: 'never', mem_limit: '256m',
      environment: { POSTGRES_DB: 'r0_synthetic', POSTGRES_USER: 'r0', POSTGRES_PASSWORD: password },
      tmpfs: ['/var/lib/postgresql/data'],
      healthcheck: { test: ['CMD', 'pg_isready', '-U', 'r0', '-d', 'r0_synthetic'], interval: '2s', timeout: '2s', retries: 30 } },
    backend: { image: 'node:24-alpine', pull_policy: 'never', mem_limit: '512m', working_dir: '/app',
      command: ['node', 'src/server.js'],
      volumes: [mount('src', '/app/src'), mount('db', '/app/db'), mount('node_modules', '/app/node_modules')],
      environment: { NODE_ENV: 'test', PORT: '8080', DATABASE_URL: `postgres://r0:${password}@database:5432/r0_synthetic`,
        SESSION_SECRET: sessionSecret, DB_AUTO_MIGRATE: 'true', DB_RUN_SEEDS: 'true',
        SEED_ADMIN_PASSWORD: password, SEED_MANAGER_PASSWORD: password, SEED_USER_PASSWORD: password,
        AUTH_PROVIDER: 'local', COOKIE_SECURE: 'false', AUTOMATION_WORKER_ENABLED: 'false', FILE_STORAGE_DRIVER: 'postgres' },
      depends_on: { database: { condition: 'service_healthy' } },
      healthcheck: { test: ['CMD', 'wget', '-q', '--spider', 'http://127.0.0.1:8080/api/health'], interval: '2s', timeout: '2s', retries: 30 } },
    frontend: { image: 'nginx:1.27-alpine', pull_policy: 'never', mem_limit: '128m',
      volumes: [...readdirSync(path.join(root, 'frontend'), { withFileTypes: true })
        .filter(entry => entry.isFile() && /\.(html|js|css|webmanifest)$/.test(entry.name))
        .map(entry => mount(`frontend/${entry.name}`, `/usr/share/nginx/html/${entry.name}`)),
        mount('frontend/nginx.conf', '/etc/nginx/conf.d/default.conf'), mount('src/public/assets', '/usr/share/nginx/html/assets')],
      depends_on: { backend: { condition: 'service_healthy' } } }
  }, networks: { default: { internal: true } }
};
function docker(args, input) {
  const result = spawnSync('docker', args, { cwd: root, input, encoding: 'utf8', windowsHide: true, timeout: 180_000 });
  // Docker logs/config may include generated credentials. Never echo raw output/errors.
  if (result.error || result.status !== 0) {
    const safe = String(result.stderr || '').replaceAll(password, '[REDACTED]').replaceAll(sessionSecret, '[REDACTED]');
    throw new Error(`Docker ${args[0]} failed (exit ${result.status ?? 'unavailable'}): ${safe.slice(-1800)}`);
  }
  return result.stdout.trim();
}
const compose = (...args) => docker(['compose', '--project-name', project, '--project-directory', root, '--env-file', 'NUL', '-f', '-', ...args], JSON.stringify(spec));
async function verifyHttp(base) {
  const checks = [];
  const call = (url, session, body, csrf = true) => fetch(base + url, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { ...(session ? { cookie: session.cookie } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify({ ...body, ...(csrf && session ? { _csrf: session.csrfToken } : {}) })
  });
  async function login(email) {
    const initial = await call('/api/auth/csrf');
    assert.equal(initial.status, 200);
    const anonymous = { cookie: initial.headers.get('set-cookie')?.split(';')[0], ...(await initial.json()) };
    const response = await call('/api/auth/login', anonymous, { email, password });
    assert.equal(response.status, 200);
    const result = { cookie: response.headers.get('set-cookie')?.split(';')[0], ...(await response.json()) };
    assert.ok(result.cookie && result.csrfToken && result.user);
    assert.notEqual(result.cookie, anonymous.cookie);
    return result;
  }
  assert.equal((await call('/api/enterprise/stocktakes')).status, 401);
  checks.push('anonymous stocktake access denied');
  const manager = await login('manager@seowon.local');
  assert.equal(manager.user.role, 'MANAGER');
  const employee = await login('employee@seowon.local');
  assert.equal(employee.user.role, 'USER');
  checks.push('real bcrypt login and session rotation for synthetic roles');
  assert.equal((await call('/api/enterprise/stocktakes', employee)).status, 403);
  checks.push('USER stocktake permission denied');
  const body = { name: 'R0 synthetic stocktake', plannedAt: '2026-09-07', organizationId: manager.user.organizationId };
  assert.equal((await call('/api/enterprise/stocktakes', manager, body, false)).status, 403);
  checks.push('missing CSRF blocks stocktake write');
  const created = await call('/api/enterprise/stocktakes', manager, body);
  assert.equal(created.status, 201);
  const id = (await created.json()).stocktake.id;
  const detail = await call(`/api/enterprise/stocktakes/${id}`, manager);
  assert.equal(detail.status, 200);
  const data = await detail.json();
  assert.ok(data.items.length > 0);
  checks.push('manager creates and reads seeded stocktake through real HTTP and PostgreSQL');
  const operation = { operationId: randomUUID(), assetId: Number(data.items[0].asset_id), baseVersion: Number(data.items[0].version), result: 'MATCH', reason: 'synthetic audit' };
  const sync = () => call(`/api/enterprise/stocktakes/${id}/offline-sync`, manager, { operations: [operation] });
  const first = await sync(); assert.equal(first.status, 200);
  assert.equal((await first.json()).results[0].status, 'APPLIED');
  const repeat = await sync(); assert.equal(repeat.status, 200);
  assert.equal((await repeat.json()).results[0].status, 'DUPLICATE');
  checks.push('offline operation applied once and replay deduplicated');
  const logout = await call('/api/auth/logout', manager, {});
  assert.equal(logout.status, 204);
  assert.equal((await call(`/api/enterprise/stocktakes/${id}`, manager)).status, 401);
  const staleWrite = await sync();
  assert.equal(staleWrite.status, 403);
  assert.equal((await staleWrite.json()).code, 'CSRF_INVALID');
  checks.push('logout invalidates old cookie for stocktake read and sync');
  return checks;
}
let started = false;
try {
  assert.deepEqual(Object.keys(spec.services).sort(), ['backend', 'database', 'frontend']);
  assert.ok(Object.values(spec.services).every(service => !service.ports));
  compose('config', '--quiet');
  started = true;
  compose('up', '-d', '--wait', '--wait-timeout', '120', '--no-build');
  const backendId = compose('ps', '-q', 'backend');
  assert.match(backendId, /^[a-f0-9]{64}$/);
  // Execute HTTP client inside the isolated network: no host publish or egress needed.
  const script = `const assert=require('node:assert/strict'); const {randomUUID}=require('node:crypto'); const password=${JSON.stringify(password)}; (${verifyHttp.toString()})('http://frontend').then(checks=>console.log(JSON.stringify(checks))).catch(error=>{console.error(JSON.stringify({name:error.name,actual:typeof error.actual==='number'?error.actual:undefined,expected:typeof error.expected==='number'?error.expected:undefined,location:error.stack?.split('\\n').filter(line=>line.trim().startsWith('at ')).slice(0,2)}));process.exit(1);});`;
  const checks = JSON.parse(docker(['exec', '-i', backendId, 'node'], script));
  const browser = process.argv.includes('--browser') ? await verifyAuthenticatedBrowser({ backendId, password }) : 'NOT_RUN';
  console.log(JSON.stringify({ status: 'PASS', checks, syntheticOnly: true, actualHttpBackend: true,
    actualPostgres: true, actualEmployeeUat: 'NOT_RUN', browser, productionChanged: false, stagingChanged: false }));
} catch (error) {
  if (started) {
    const logs = compose('logs', '--no-color', '--tail', '5', 'backend');
    // Only event and startup error class are exposed, not arbitrary messages/config.
    for (const line of logs.split('\n')) {
      try { const event = JSON.parse(line.slice(line.indexOf('{'))); console.error(JSON.stringify({ event: event.event, name: event.name })); } catch {}
    }
  }
  throw error;
} finally {
  if (started) {
    const ids = docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`]).split(/\s+/).filter(Boolean);
    if (ids.length > 3) throw new Error('Unexpected test target count; cleanup stopped');
    if (ids.length) {
      const targets = JSON.parse(docker(['inspect', ...ids]));
      assert.ok(targets.every(item => item.Config.Labels['com.docker.compose.project'] === project && Object.hasOwn(spec.services, item.Config.Labels['com.docker.compose.service'])));
      // Only this invocation's fresh synthetic containers/network; never named or host volumes.
      compose('down', '--timeout', '10');
    }
  }
}
