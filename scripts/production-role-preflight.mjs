import { existsSync, statSync } from 'node:fs';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { PRODUCTION_UAT_ROLES, evaluateProductionRolePreflight } from '../src/operations/production-role-preflight.mjs';
import {
  parseProductionRolePreflightContainerId,
  parseProductionRolePreflightCounts,
  runProductionRolePreflightProcess
} from '../src/operations/production-role-preflight-runtime.mjs';

const CREDENTIAL_REFERENCE_ENV = Object.freeze({
  ADMIN: 'PRODUCTION_UAT_ADMIN_CREDENTIAL_FILE',
  MANAGER: 'PRODUCTION_UAT_MANAGER_CREDENTIAL_FILE',
  USER: 'PRODUCTION_UAT_USER_CREDENTIAL_FILE'
});

function dockerContainer(service) {
  const result = runProductionRolePreflightProcess([
    'ps', '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
    '--filter', `label=com.docker.compose.service=${service}`, '--format', '{{.ID}}'
  ]);
  return parseProductionRolePreflightContainerId(result.stdout);
}

function isExistingFile(value) {
  if (!value || !existsSync(value)) return false;
  try { return statSync(value).isFile(); } catch { return false; }
}

async function main() {
  const now = new Date();
  const insideWindow = now >= new Date(PRODUCTION_CHANGE_WINDOW.start)
    && now <= new Date(PRODUCTION_CHANGE_WINDOW.end);
  const database = dockerContainer('database');
  const sql = `select role,
  count(*) filter(where status='ACTIVE'),
  count(*) filter(where status='ACTIVE' and mfa_enabled=true)
from users
where role in ('ADMIN','MANAGER','USER')
group by role
order by role`;
  const dbResult = runProductionRolePreflightProcess([
    'exec', database, 'psql', '-U', 'seowon', '-d', 'seowon_inventory', '-At', '-F', ',', '-c', sql
  ]);
  const roleCounts = parseProductionRolePreflightCounts(dbResult.stdout);
  const credentialReferences = Object.fromEntries(PRODUCTION_UAT_ROLES.map((role) => [
    role, isExistingFile(process.env[CREDENTIAL_REFERENCE_ENV[role]])
  ]));
  const result = evaluateProductionRolePreflight({ insideWindow, roleCounts, credentialReferences });

  console.log(JSON.stringify({
    checkedAt: now.toISOString(),
    insideWindow,
    credentialReferenceEnvironment: CREDENTIAL_REFERENCE_ENV,
    ...result
  }, null, 2));
}

main().catch((error) => {
  const failure = /^ROLE_PREFLIGHT_[A-Z_]+$/.test(error?.message)
    ? error.message
    : 'ROLE_PREFLIGHT_RUNTIME_FAILED';
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    status: 'FAIL_ROLE_PREFLIGHT_RUNTIME',
    failures: [failure],
    secretValuesReadOrRecorded: false,
    productionGo: false
  }, null, 2));
  process.exitCode = 1;
});
