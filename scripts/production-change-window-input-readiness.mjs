import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateChangeWindowInputReadiness, MUTATING_CONFIRMATION_NAMES, PREWINDOW_REFERENCE_NAMES } from '../src/operations/production-change-window-input-readiness.mjs';
import { inspectProductionUatJsonReference, readProductionUatJsonDocument } from '../src/operations/production-uat-input-reader.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isPhysicalFile = (value) => {
  if (!value) return false;
  try { const stat = fs.lstatSync(path.resolve(value)); return stat.isFile() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false); } catch { return false; }
};
const isPhysicalDirectory = (value) => {
  try { const resolved = path.resolve(value); const stat = fs.lstatSync(resolved); return stat.isDirectory() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false) && path.resolve(fs.realpathSync(resolved)).toLowerCase() === resolved.toLowerCase(); } catch { return false; }
};
const uatReferenceNames = new Set(['PRODUCTION_UAT_ACTOR_APPROVAL_FILE', 'PRODUCTION_UAT_ADMIN_CREDENTIAL_FILE', 'PRODUCTION_UAT_MANAGER_CREDENTIAL_FILE', 'PRODUCTION_UAT_USER_CREDENTIAL_FILE']);
const uatReferencePresent = (name) => inspectProductionUatJsonReference(process.env[name], { repositoryRoot: projectRoot }).present;
const readUatJson = (name) => readProductionUatJsonDocument(process.env[name], { repositoryRoot: projectRoot }).value;
const physicalReferences = Object.fromEntries(PREWINDOW_REFERENCE_NAMES.map((name) => [name, uatReferenceNames.has(name) ? uatReferencePresent(name) : isPhysicalFile(process.env[name])]));
const actorReady = ['PRODUCTION_UAT_ACTOR_APPROVAL_FILE', 'PRODUCTION_UAT_ADMIN_CREDENTIAL_FILE', 'PRODUCTION_UAT_MANAGER_CREDENTIAL_FILE', 'PRODUCTION_UAT_USER_CREDENTIAL_FILE'].every((name) => physicalReferences[name]);
let approval = null; let credentials = {};
try {
  if (actorReady) {
    approval = readUatJson('PRODUCTION_UAT_ACTOR_APPROVAL_FILE');
    credentials = Object.fromEntries(['ADMIN', 'MANAGER', 'USER'].map((role) => [role, readUatJson(`PRODUCTION_UAT_${role}_CREDENTIAL_FILE`)]));
  }
} catch { approval = {}; credentials = {}; }
const outputPath = process.env.PRODUCTION_CUTOVER_ACTUAL_EVIDENCE_FILE;
const outputTarget = outputPath ? { path: outputPath, exists: fs.existsSync(path.resolve(outputPath)), parentPhysical: isPhysicalDirectory(path.dirname(path.resolve(outputPath))) } : null;
const result = evaluateChangeWindowInputReadiness({
  projectRoot, physicalReferences, approval, credentials, outputTarget,
  runtimePhysical: isPhysicalDirectory('D:\\seowon_runtime\\sqcm-i-inventory-production'),
  cloudflaredPresent: isPhysicalFile('C:\\Program Files (x86)\\cloudflared\\cloudflared.exe'),
  originCertificatePresent: isPhysicalFile('C:\\Users\\user\\.cloudflared\\cert.pem'),
  armedConfirmations: MUTATING_CONFIRMATION_NAMES.filter((name) => Boolean(process.env[name]))
});
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...result, requiredReferenceEnvironment: PREWINDOW_REFERENCE_NAMES, requiredOutputEnvironment: 'PRODUCTION_CUTOVER_ACTUAL_EVIDENCE_FILE', mutatingConfirmationsMustRemainUnsetUntilExecution: MUTATING_CONFIRMATION_NAMES, secretValuesReadOrRecorded: false, externalMutationPerformed: false, productionGo: false }, null, 2));
if (result.status.startsWith('BLOCKED_')) process.exitCode = 1;
