// Fresh, synthetic-only three-service environment. Never loads repository .env.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { verifyAuthenticatedBrowser } from './r0-authenticated-browser.mjs';
import { verifyC4Postgres } from './r0-c4-postgres-fixture.mjs';
import { verifyImportPostgres } from './r0-import-postgres-fixture.mjs';
import { verifyCostPostgres } from './r3-cost-postgres-fixture.mjs';
import { probeRepairCost } from './r3-repair-cost-probe.mjs';

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
      volumes: [mount('src', '/app/src'), mount('db', '/app/db'), mount('node_modules', '/app/node_modules'), mount('test', '/app/test')],
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
const candidateSha = process.argv.find(arg => arg.startsWith('--candidate-sha='))?.split('=')[1];
if (candidateSha !== undefined) {
  assert.match(candidateSha,/^[a-f0-9]{40}$/);
  for (const service of ['backend','frontend']) {
    const tag=`sqcm-r4-${service}:sha-${candidateSha}`;
    const info=JSON.parse(docker(['image','inspect',tag]))[0];
    assert.equal(info.Config.Labels?.['org.opencontainers.image.revision'],candidateSha);
    spec.services[service].image=info.Id;
    // Test code only; application, migrations, dependencies and UI come from the image.
    spec.services[service].volumes=service==='backend'?[mount('test','/app/test')]:[];
  }
}
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
const restoreRequested = process.argv.includes('--backup-restore');
let backupSql, backupFingerprint, databaseId;
const dataFingerprint = `const {Pool}=require('pg');const {createHash}=require('node:crypto');const p=new Pool({connectionString:process.env.DATABASE_URL});(async()=>{const result={};for(const table of ['assets','workflow_requests','asset_cost_events','schema_migrations']){const rows=(await p.query('SELECT * FROM '+table)).rows.map(row=>JSON.stringify(row)).sort();result[table]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}console.log(JSON.stringify(result));await p.end();})().catch(()=>process.exit(1));`;
try {
  assert.deepEqual(Object.keys(spec.services).sort(), ['backend', 'database', 'frontend']);
  assert.ok(Object.values(spec.services).every(service => !service.ports));
  compose('config', '--quiet');
  started = true;
  if (restoreRequested) {
    assert.ok(candidateSha, 'Backup restore requires an image candidate');
    assert.ok(!process.argv.includes('--rollback-backend'), 'Choose exactly one rollback method');
    const candidateImage = spec.services.backend.image;
    spec.services.backend.image = JSON.parse(docker(['image','inspect','ghcr.io/visionlab-coder/sqcm-i-inventory-backend:sha-38b2bca7f34a7a950469c8d0cd6d2a4b11e3b7a6']))[0].Id;
    compose('up','-d','--wait','--wait-timeout','120','--no-build');
    const oldId = compose('ps','-q','backend');
    databaseId = compose('ps','-q','database');
    assert.match(databaseId,/^[a-f0-9]{64}$/);
    const owned = JSON.parse(docker(['inspect',databaseId]))[0];
    assert.equal(owned.Config.Labels['com.docker.compose.project'],project);
    assert.equal(owned.Config.Labels['com.docker.compose.service'],'database');
    backupFingerprint = JSON.parse(docker(['exec','-i',oldId,'node'],dataFingerprint));
    // Synthetic dump stays in memory; never print/write it or read a production backup.
    backupSql = docker(['exec',databaseId,'pg_dump','-U','r0','-d','r0_synthetic','--no-owner','--no-acl']);
    assert.ok(backupSql.includes('PostgreSQL database dump complete'));
    spec.services.backend.image = candidateImage;
  }
  compose('up', '-d', '--wait', '--wait-timeout', '120', '--no-build');
  const backendId = compose('ps', '-q', 'backend');
  assert.match(backendId, /^[a-f0-9]{64}$/);
  // Execute HTTP client inside the isolated network: no host publish or egress needed.
  const script = `const assert=require('node:assert/strict'); const {randomUUID}=require('node:crypto'); const password=${JSON.stringify(password)}; (${verifyHttp.toString()})('http://frontend').then(checks=>console.log(JSON.stringify(checks))).catch(error=>{console.error(JSON.stringify({name:error.name,actual:typeof error.actual==='number'?error.actual:undefined,expected:typeof error.expected==='number'?error.expected:undefined,location:error.stack?.split('\\n').filter(line=>line.trim().startsWith('at ')).slice(0,2)}));process.exit(1);});`;
  const checks = JSON.parse(docker(['exec', '-i', backendId, 'node'], script));
  if (process.argv.includes('--browser') && process.argv.includes('--lifecycle')) {
    docker(['exec','-i',backendId,'node'], `const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query("UPDATE users SET password_reset_required=true WHERE email='employee@seowon.local'").then(()=>p.end()).catch(()=>process.exit(1));`);
  }
  const browser = process.argv.includes('--browser') ? await verifyAuthenticatedBrowser({ backendId, password, excel: process.argv.includes('--excel'), lifecycle: process.argv.includes('--lifecycle') }) : 'NOT_RUN';
  const c4 = process.argv.includes('--c4') ? JSON.parse(docker(['exec', '-i', backendId, 'node'],
    `(${verifyC4Postgres.toString()})().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(JSON.stringify({name:error.name,code:error.code}));process.exit(1);});`)) : 'NOT_RUN';
  const excel = process.argv.includes('--excel') ? JSON.parse(docker(['exec', '-i', backendId, 'node'],
    `(${verifyImportPostgres.toString()})().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(JSON.stringify({name:error.name,code:error.code}));process.exit(1);});`)) : 'NOT_RUN';
  let lifecycle = 'NOT_RUN';
  const cost = process.argv.includes('--cost') ? JSON.parse(docker(['exec', '-i', backendId, 'node'],
    `(${verifyCostPostgres.toString()})().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(JSON.stringify({name:error.name,code:error.code}));process.exit(1);});`)) : 'NOT_RUN';
  if (process.argv.includes('--lifecycle')) {
    const output = docker(['exec', '-i', backendId, 'node'], `const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-name-pattern=초기 비밀번호 계정|TOTP MFA','test/integration/http-smoke.test.js','test/integration/mfa-auth.test.js'],{env:{...process.env,INTEGRATION_BASE_URL:'http://frontend',INTEGRATION_DATABASE_URL:process.env.DATABASE_URL},encoding:'utf8'});const pass=Number(r.stdout.match(/# pass (\\d+)/)?.[1]);if(r.status!==0||pass!==2){console.error('Lifecycle integration failed or selected tests skipped');process.exit(1);}console.log(JSON.stringify({status:'PASS',pass,syntheticOnly:true}));`);
    lifecycle = JSON.parse(output);
  }
  const repairCostProbe = process.argv.includes('--repair-probe') ? JSON.parse(docker(['exec', '-i', backendId, 'node'],
    `(${probeRepairCost.toString()})().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(JSON.stringify({name:error.name,code:error.code}));process.exit(1);});`)) : 'NOT_RUN';
  let repair = 'NOT_RUN';
  if (process.argv.includes('--repair')) {
    repair = JSON.parse(docker(['exec','-i',backendId,'node'],`const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-name-pattern=수리 비용 상태 변경은','test/integration/http-smoke.test.js'],{env:{...process.env,INTEGRATION_BASE_URL:'http://frontend',INTEGRATION_DATABASE_URL:process.env.DATABASE_URL},encoding:'utf8'});const pass=Number(r.stdout.match(/# pass (\\d+)/)?.[1]);if(r.status!==0||pass!==1){console.error(JSON.stringify({status:'FAIL',pass,exitCode:r.status,failures:r.stdout.split('\\n').filter(line=>/^not ok|^  error:|^  code:/.test(line))}));process.exit(1);}console.log(JSON.stringify({status:'PASS',pass,syntheticOnly:true}));`));
  }
  let workflow = 'NOT_RUN';
  if (process.argv.includes('--workflow')) {
    const output = docker(['exec', '-i', backendId, 'node'], `const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-name-pattern=기업 자산 요청은|2단계 승인 정책은|반납 사진은','test/integration/http-smoke.test.js'],{env:{...process.env,INTEGRATION_BASE_URL:'http://frontend',INTEGRATION_DATABASE_URL:process.env.DATABASE_URL},encoding:'utf8'});const pass=Number(r.stdout.match(/# pass (\\d+)/)?.[1]);if(r.status!==0||pass!==3){console.error(JSON.stringify({status:'FAIL',pass,exitCode:r.status,failures:r.stdout.split('\\n').filter(line=>/^not ok|^  error:|^  code:/.test(line))}));process.exit(1);}console.log(JSON.stringify({status:'PASS',pass,syntheticOnly:true}));`);
    workflow = JSON.parse(output);
  }
  let rollback = 'NOT_RUN';
  if (restoreRequested) {
    const candidateFingerprint = JSON.parse(docker(['exec','-i',backendId,'node'],dataFingerprint));
    assert.equal(candidateFingerprint.schema_migrations.count,backupFingerprint.schema_migrations.count+5);
    // Create a new database, never DROP/TRUNCATE or overwrite the upgraded database.
    docker(['exec',databaseId,'createdb','-U','r0','r4_restore']);
    docker(['exec','-i',databaseId,'psql','-U','r0','-d','r4_restore','-v','ON_ERROR_STOP=1'],backupSql);
    backupSql = undefined;
    const originalUrl = spec.services.backend.environment.DATABASE_URL;
    spec.services.backend.image = JSON.parse(docker(['image','inspect','ghcr.io/visionlab-coder/sqcm-i-inventory-backend:sha-38b2bca7f34a7a950469c8d0cd6d2a4b11e3b7a6']))[0].Id;
    spec.services.backend.environment.DATABASE_URL = originalUrl.replace(/\/r0_synthetic$/,'/r4_restore');
    spec.services.backend.environment.DB_AUTO_MIGRATE = 'false';
    spec.services.backend.environment.DB_RUN_SEEDS = 'false';
    compose('up','-d','--no-deps','--wait','--wait-timeout','120','backend');
    const restoredId = compose('ps','-q','backend');
    const restored = JSON.parse(docker(['exec','-i',restoredId,'node'],dataFingerprint));
    assert.deepEqual(restored,backupFingerprint);
    docker(['exec','-i',restoredId,'node'],`const assert=require('node:assert/strict');(async()=>{const c=await fetch('http://frontend/api/auth/csrf');assert.equal(c.status,200);const token=(await c.json()).csrfToken;const r=await fetch('http://frontend/api/auth/login',{method:'POST',headers:{cookie:c.headers.get('set-cookie').split(';')[0],'content-type':'application/json'},body:JSON.stringify({email:'admin@seowon.local',password:process.env.SEED_ADMIN_PASSWORD,_csrf:token})});assert.equal(r.status,200);assert.ok((await r.json()).user);console.log('RESTORED_LOGIN_PASS');})().catch(()=>process.exit(1));`);
    const preserved = JSON.parse(docker(['exec','-i',restoredId,'node'],dataFingerprint.replace('process.env.DATABASE_URL',"process.env.DATABASE_URL.replace(/\\/r4_restore$/,'/r0_synthetic')")));
    assert.deepEqual(preserved,candidateFingerprint);
    rollback = { status:'PASS_BACKUP_RESTORE_ISOLATED', oldSchemaMigrations:restored.schema_migrations.count,
      candidateSchemaMigrations:candidateFingerprint.schema_migrations.count, comparedTables:4,
      restoredLogin:'PASS', candidateDatabasePreserved:true, productionRollback:'NOT_RUN', postCutoverReconciliation:'REQUIRES_APPROVED_PLAN' };
  }
  if (process.argv.includes('--rollback-backend')) {
    assert.ok(candidateSha,'Rollback rehearsal requires an image candidate');
    const snapshotScript=`const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query("SELECT (SELECT count(*)::int FROM assets) assets,(SELECT count(*)::int FROM workflow_requests) requests,(SELECT count(*)::int FROM asset_cost_events) costs").then(r=>console.log(JSON.stringify(r.rows[0]))).finally(()=>p.end());`;
    const before=JSON.parse(docker(['exec','-i',backendId,'node'],snapshotScript));
    const oldTag='ghcr.io/visionlab-coder/sqcm-i-inventory-backend:sha-38b2bca7f34a7a950469c8d0cd6d2a4b11e3b7a6';
    const oldImage=JSON.parse(docker(['image','inspect',oldTag]))[0].Id;
    spec.services.backend.image=oldImage;
    spec.services.backend.environment.DB_AUTO_MIGRATE='false';
    spec.services.backend.environment.DB_RUN_SEEDS='false';
    compose('up','-d','--no-deps','--wait','--wait-timeout','120','backend');
    const rollbackId=compose('ps','-q','backend');
    assert.match(rollbackId,/^[a-f0-9]{64}$/);
    const after=JSON.parse(docker(['exec','-i',rollbackId,'node'],snapshotScript));
    assert.deepEqual(after,before);
    docker(['exec','-i',rollbackId,'node'],`const assert=require('node:assert/strict');(async()=>{const base='http://127.0.0.1:8080';const c=await fetch(base+'/api/auth/csrf');assert.equal(c.status,200);const token=(await c.json()).csrfToken;const cookie=c.headers.get('set-cookie').split(';')[0];const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({email:'admin@seowon.local',password:process.env.SEED_ADMIN_PASSWORD,_csrf:token})});assert.equal(r.status,200);assert.ok((await r.json()).user);console.log('ROLLBACK_LOGIN_PASS');})().catch(()=>process.exit(1));`);
    rollback={status:'PASS',scope:'previous backend healthy and login on candidate schema, core row counts preserved',oldImage,counts:after,productionRollback:'NOT_RUN'};
  }
  console.log(JSON.stringify({ status: repairCostProbe?.status === 'GAP_CONFIRMED' ? 'GAP_CONFIRMED' : 'PASS', checks, syntheticOnly: true, actualHttpBackend: true,
    actualPostgres: true, candidateSha: candidateSha || null, sourceMounted: !candidateSha, actualEmployeeUat: 'NOT_RUN', browser, c4, excel, cost, lifecycle, workflow, repair, rollback, repairCostProbe, productionChanged: false, stagingChanged: false }));
} catch (error) {
  if (started) {
    const logs = compose('logs', '--no-color', '--tail', '5', 'backend');
    // Only event and startup error class are exposed, not arbitrary messages/config.
    for (const line of logs.split('\n')) {
      try {
        const event = JSON.parse(line.slice(line.indexOf('{')));
        const mismatch = /^application migration target mismatch: expected (\d+), applied (\d+)\.$/.exec(event.message || '');
        console.error(JSON.stringify({ event: event.event, name: event.name,
          ...(mismatch ? { code: 'MIGRATION_TARGET_MISMATCH', expected: Number(mismatch[1]), applied: Number(mismatch[2]) } : {}) }));
      } catch {}
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
