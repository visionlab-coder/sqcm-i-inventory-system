import {
  parseProductionRolePreflightContainerId,
  runProductionRolePreflightProcess
} from '../src/operations/production-role-preflight-runtime.mjs';

const DATABASE_MODULE = './src/' + 'db.js';
const VERIFY_SOURCE = [
  `import db from ${JSON.stringify(DATABASE_MODULE)};`,
  'const pool = db.createPool(process.env.DATABASE_URL);',
  "try { const result = await db.verifyMigrationHistory(pool, 'application');",
  "console.log(JSON.stringify({ expected: result.expected, applied: result.applied, history: result.history || 'application' }));",
  '} finally { await pool.end(); }'
].join(' ');

function backendContainer() {
  const result = runProductionRolePreflightProcess([
    'ps', '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
    '--filter', 'label=com.docker.compose.service=backend', '--format', '{{.ID}}'
  ]);
  return parseProductionRolePreflightContainerId(result.stdout);
}

try {
  const containerId = backendContainer();
  const result = runProductionRolePreflightProcess([
    'exec', containerId, 'node', '--input-type=module', '-e', VERIFY_SOURCE
  ]);
  const migration = JSON.parse(result.stdout);
  if (!Number.isSafeInteger(migration.expected) || migration.expected < 1
    || migration.applied !== migration.expected || migration.history !== 'application') {
    throw new Error('PRODUCTION_MIGRATION_HISTORY_MISMATCH');
  }
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    status: 'PASS_PRODUCTION_MIGRATION_HISTORY',
    expected: migration.expected,
    applied: migration.applied,
    history: migration.history,
    databaseHostPortRequired: false,
    productionGo: false
  }, null, 2));
} catch {
  console.error(JSON.stringify({
    checkedAt: new Date().toISOString(),
    status: 'FAIL_PRODUCTION_MIGRATION_HISTORY',
    failures: ['PRODUCTION_MIGRATION_HISTORY_NOT_VERIFIED'],
    databaseHostPortRequired: false,
    productionGo: false
  }, null, 2));
  process.exitCode = 1;
}
