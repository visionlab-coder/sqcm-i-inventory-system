import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { PRODUCTION_UAT_ROLES, evaluateProductionRolePreflight } from '../src/operations/production-role-preflight.mjs';

const CREDENTIAL_REFERENCE_ENV = Object.freeze({
  ADMIN: 'PRODUCTION_UAT_ADMIN_CREDENTIAL_FILE',
  MANAGER: 'PRODUCTION_UAT_MANAGER_CREDENTIAL_FILE',
  USER: 'PRODUCTION_UAT_USER_CREDENTIAL_FILE'
});

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

function isExistingFile(value) {
  if (!value || !existsSync(value)) return false;
  try { return statSync(value).isFile(); } catch { return false; }
}

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
const dbResult = spawnSync('docker', [
  'exec', database, 'psql', '-U', 'seowon', '-d', 'seowon_inventory', '-At', '-F', ',', '-c', sql
], { encoding: 'utf8', windowsHide: true });
if (dbResult.status !== 0) throw new Error('Unable to read Production role and MFA readiness.');

const roleCounts = Object.fromEntries(PRODUCTION_UAT_ROLES.map((role) => [role, { active: 0, mfaEnabled: 0 }]));
for (const line of dbResult.stdout.trim().split(/\r?\n/).filter(Boolean)) {
  const [role, active, mfaEnabled] = line.split(',');
  if (PRODUCTION_UAT_ROLES.includes(role)) roleCounts[role] = { active: Number(active), mfaEnabled: Number(mfaEnabled) };
}
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
