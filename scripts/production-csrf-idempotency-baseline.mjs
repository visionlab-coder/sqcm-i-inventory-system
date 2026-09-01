import {
  parseCsrfIdempotencyBaselineContainerId,
  parseCsrfIdempotencyBaselineCount,
  parseCsrfIdempotencyBaselineSchema,
  readCsrfIdempotencyBaselineJson,
  requestCsrfIdempotencyBaseline,
  runCsrfIdempotencyBaselineProcess
} from '../src/operations/production-csrf-idempotency-baseline-runtime.mjs';

const baseUrl = 'http://127.0.0.1:3300';
const productionOrigin = 'https://inventory.safe-link.co.kr';

function dockerContainer(service) {
  const result = runCsrfIdempotencyBaselineProcess([
    'ps', '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
    '--filter', `label=com.docker.compose.service=${service}`, '--format', '{{.ID}}'
  ]);
  return parseCsrfIdempotencyBaselineContainerId(result.stdout);
}

function query(database, sql) {
  return runCsrfIdempotencyBaselineProcess([
    'exec', database, 'psql', '-U', 'seowon', '-d', 'seowon_inventory', '-At', '-F', ',', '-c', sql
  ]).stdout;
}

async function main() {
  const database = dockerContainer('database');
  const sessionsBefore = parseCsrfIdempotencyBaselineCount(query(database, 'select count(*) from user_sessions'));
  const response = await requestCsrfIdempotencyBaseline({
    url: `${baseUrl}/api/auth/login`,
    options: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: productionOrigin,
        'sec-fetch-site': 'same-origin'
      },
      body: '{}'
    }
  });
  const responseBody = await readCsrfIdempotencyBaselineJson(response);

  const sql = `select
  (select count(*) from information_schema.columns where table_schema='public' and table_name='api_idempotency_keys' and column_name in ('id','user_id','idempotency_key','request_hash','status','response_status','response_content_type','response_body_base64','created_at','updated_at')),
  (select count(*) from pg_indexes where schemaname='public' and tablename='api_idempotency_keys' and indexdef ilike '%unique%' and indexdef like '%(user_id, idempotency_key)%'),
  (select count(*) from api_idempotency_keys where status='PROCESSING' and updated_at < now()-interval '2 minutes'),
  (select count(*) from api_idempotency_keys where status not in ('PROCESSING','COMPLETED')),
  (select count(*) from user_sessions)`;
  const [columnCount, uniqueIndexCount, stuckCount, invalidStatusCount, sessionsAfter] =
    parseCsrfIdempotencyBaselineSchema(query(database, sql));
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
    secretValuesReadOrRecorded: false,
    productionGo: false
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  const failure = /^CSRF_BASELINE_[A-Z_]+$/.test(error?.message)
    ? error.message
    : 'CSRF_BASELINE_RUNTIME_FAILED';
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    status: 'FAIL_CSRF_IDEMPOTENCY_BASELINE_RUNTIME',
    failures: [failure],
    secretValuesReadOrRecorded: false,
    productionGo: false
  }, null, 2));
  process.exitCode = 1;
});
