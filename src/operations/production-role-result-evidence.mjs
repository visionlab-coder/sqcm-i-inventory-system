import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { evaluateRoleCoreSmoke } from './production-role-core-smoke.mjs';
import { PRODUCTION_CHANGE_WINDOW } from './production-cutover-preflight.mjs';
import {
  assertCreateOnlyJsonOutputReady,
  writeCreateOnlyJsonOutput
} from './operations-create-only-json-output.mjs';

export const ROLE_RESULT_EVIDENCE_CONFIRMATION = 'ACK-P6-COMPILE-PRODUCTION-ROLE-RESULTS';
const SHA256 = /^[a-f0-9]{64}$/;
const RUN_ID = /^[a-f0-9]{8}-[a-f0-9-]{27,35}$/i;

export function productionRoleResultSetPublicationId({
  runId, releaseSha, coreGateSha, roleStepSha, checkedAt
} = {}) {
  return createHash('sha256').update(JSON.stringify({
    runId, releaseSha, coreGateSha, roleStepSha, checkedAt
  })).digest('hex');
}

export function compileProductionRoleResultEvidence({ roleStepDocument, coreGateDocument, runId, releaseSha } = {}) {
  const failures = [];
  if (!RUN_ID.test(runId || '') || !/^[a-f0-9]{40}$/.test(releaseSha || '')) failures.push('ROLE_RESULT_PROVENANCE_INVALID');
  const step = roleStepDocument?.value;
  const gate = coreGateDocument?.value;
  if (!SHA256.test(roleStepDocument?.sha256 || '') || !SHA256.test(coreGateDocument?.sha256 || '')) failures.push('ROLE_RESULT_RECEIPT_SHA_INVALID');
  if (step?.schemaVersion !== 1 || step?.runId !== runId || step?.kind !== 'step' || step?.gate !== 'core_smoke'
    || step?.step !== 'role-core-smoke' || step?.status !== 'PASS_PRODUCTION_ROLE_CORE_SMOKE' || step?.exitCode !== 0) failures.push('ROLE_SMOKE_STEP_RECEIPT_INVALID');
  if (gate?.schemaVersion !== 1 || gate?.runId !== runId || gate?.kind !== 'gate' || gate?.gate !== 'core_smoke'
    || gate?.status !== 'PASS' || !(gate?.evidenceRefs || []).includes(roleStepDocument?.fileName)) failures.push('ROLE_SMOKE_GATE_RECEIPT_INVALID');
  const summary = step?.summary;
  if (summary?.evidenceType !== 'P6_ROLE_CORE_SMOKE_SUMMARY' || summary?.targetKind !== 'production-https'
    || summary?.actualRoleCoreSmoke !== 'PASS') failures.push('ROLE_SMOKE_SUMMARY_NOT_ACTUAL_PRODUCTION');
  const evaluation = evaluateRoleCoreSmoke({ ...(summary?.roles || {}), anonymousItems: summary?.anonymousItems });
  if (evaluation.failures.length) failures.push(...evaluation.failures.map((failure) => `ROLE_SMOKE_${failure}`));
  const checkedAt = step?.checkedAt;
  const time = Date.parse(checkedAt);
  if (!Number.isFinite(time) || time < Date.parse(PRODUCTION_CHANGE_WINDOW.start) || time > Date.parse(PRODUCTION_CHANGE_WINDOW.end)) failures.push('ROLE_SMOKE_CHECKED_AT_OUTSIDE_WINDOW');
  if (failures.length) return { status: 'FAIL_PRODUCTION_ROLE_RESULT_EVIDENCE', failures: [...new Set(failures)], productionGo: false };
  const resultSetPublicationId = productionRoleResultSetPublicationId({
    runId,
    releaseSha,
    coreGateSha: coreGateDocument.sha256,
    roleStepSha: roleStepDocument.sha256,
    checkedAt
  });
  const documents = Object.fromEntries(['ADMIN', 'MANAGER', 'USER'].map((role) => [role, {
    schemaVersion: 1, template: false, evidenceType: 'P6_ROLE_UAT_RESULT_ACTUAL',
    environment: 'production', activationState: 'actual', targetUrl: 'https://inventory.safe-link.co.kr',
    releaseTag: `sha-${releaseSha}`, runId, role, status: 'PASS', actualProduction: true,
    resultSetPublicationId,
    coreSmokeGateReceiptSha256: coreGateDocument.sha256, roleSmokeStepReceiptSha256: roleStepDocument.sha256,
    checkedAt
  }]));
  return { status: 'PASS_PRODUCTION_ROLE_RESULT_EVIDENCE', failures: [], documents, productionGo: false };
}

export function writeProductionRoleResultEvidence(outputPaths, documents, {
  io = fs, repositoryRoot = process.cwd(), processId = process.pid
} = {}) {
  const outputs = ['ADMIN', 'MANAGER', 'USER'].map((role) => {
    const candidate = outputPaths?.[role];
    if (typeof candidate !== 'string' || !candidate) throw new Error('ROLE_RESULT_OUTPUT_INVALID');
    return [role, path.resolve(candidate)];
  });
  const repo = path.resolve(repositoryRoot).toLowerCase();
  const outputKeys = outputs.map(([, output]) => output.toLowerCase());
  if (new Set(outputKeys).size !== outputs.length) throw new Error('ROLE_RESULT_OUTPUT_PATHS_MUST_BE_DISTINCT');
  for (const [, output] of outputs) {
    if (output.toLowerCase() === repo || output.toLowerCase().startsWith(`${repo}${path.sep}`)) {
      throw new Error('ROLE_RESULT_OUTPUT_MUST_BE_EXTERNAL');
    }
    assertCreateOnlyJsonOutputReady(output, {
      io,
      alreadyExistsCode: 'ROLE_RESULT_OUTPUT_ALREADY_EXISTS'
    });
  }
  const published = [];
  try {
    for (const [index, [role, output]] of outputs.entries()) {
      writeCreateOnlyJsonOutput(output, documents[role], {
        io,
        processId: processId + index,
        alreadyExistsCode: 'ROLE_RESULT_OUTPUT_ALREADY_EXISTS'
      });
      published.push(output);
    }
    return Object.fromEntries(outputs);
  } catch (error) {
    if (published.length > 0) {
      throw new Error(`ROLE_RESULT_OUTPUT_SET_PARTIAL_COMMIT:${published.length}_OF_${outputs.length}`);
    }
    throw error;
  }
}
