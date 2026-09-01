import { spawnSync } from 'node:child_process';

const baseUrl = 'http://127.0.0.1:3300';
const productionOrigin = 'https://inventory.safe-link.co.kr';

function dockerContainer(service) {
  const result = spawnSync('docker', [
    'ps', '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
    '--filter', `label=com.docker.compose.service=${service}`, '--format', '{{.ID}}'
  ], { encoding: 'utf8', windowsHide: true });
  const ids = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (result.status !== 0 || ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) {
    throw new Error(`Exactly one running Production ${service} container is required.`);
  }
  return ids[0];
}

function query(database, sql) {
  const result = spawnSync('docker', [
    'exec', database, 'psql', '-U', 'seowon', '-d', 'seowon_inventory', '-At', '-F', ',', '-c', sql
  ], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Unable to read Production CSRF/idempotency state.');
  return result.stdout.trim();
}

const database = dockerContainer('database');
const sessionsBefore = Number(query(database, 'select count(*) from user_sessions'));
const response = await fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: productionOrigin,
    'sec-fetch-site': 'same-origin'
  },
  body: '{}',
  signal: AbortSignal.timeout(10_000)
});
const responseBody = await response.json().catch(() => ({}));

const sql = `select
  (select count(*) from information_schema.columns where table_schema='public' and table_name='api_idempotency_keys' and column_name in ('id','user_id','idempotency_key','request_hash','status','response_status','response_content_type','response_body_base64','created_at','updated_at')),
  (select count(*) from pg_indexes where schemaname='public' and tablename='api_idempotency_keys' and indexdef ilike '%unique%' and indexdef like '%(user_id, idempotency_key)%'),
  (select count(*) from api_idempotency_keys where status='PROCESSING' and updated_at < now()-interval '2 minutes'),
  (select count(*) from api_idempotency_keys where status not in ('PROCESSING','COMPLETED')),
  (select count(*) from user_sessions)`;
const [columnCount, uniqueIndexCount, stuckCount, invalidStatusCount, sessionsAfter] = query(database, sql).split(',').map(Number);
const failures = [];
if (response.status !== 403 || responseBody.code !== 'CSRF_INVALID') failures.push('CSRF_MISSING_TOKEN_NOT_REJECTED');
if (sessionsAfter !== sessionsBefore) failures.push('CSRF_NEGATIVE_PROBE_CREATED_SESSION');
if (columnCount !== 10) failures.push(`IDEMPOTENCY_COLUMN_CONTRACT_${columnCount}_OF_10`);
if (uniqueIndexCount !== 1) failures.push(`IDEMPOTENCY_UNIQUE_INDEX_COUNT_${uniqueIndexCount}`);
if (stuckCount !== 0) failures.push(`STUCK_IDEMPOTENCY_COUNT_${stuckCount}`);
if (invalidStatusCount !== 0) failures.push(`INVALID_IDEMPOTENCY_STATUS_COUNT_${invalidStatusCount}`);

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  status: failures.length ? 'FAIL_CSRF_IDEMPOTENCY_BASELINE' : 'PASS_NEGATIVE_AND_SCHEMA_BASELINE_READY_FOR_AUTHENTICATED_RECHECK',
  target: baseUrl,
  csrf: { missingTokenStatus: response.status, missingTokenCode: responseBody.code || null, sessionCountUnchanged: sessionsAfter === sessionsBefore },
  idempotency: { columnContract: `${columnCount}/10`, uniqueUserKeyIndexCount: uniqueIndexCount, stuckCount, invalidStatusCount },
  failures,
  actualAuthenticatedIdempotentWriteReplay: 'NOT_RUN',
  productionGo: false
}, null, 2));
if (failures.length) process.exitCode = 1;
