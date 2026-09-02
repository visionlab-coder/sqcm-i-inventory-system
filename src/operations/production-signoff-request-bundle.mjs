import { createHash } from 'node:crypto';
import path from 'node:path';
import { PRODUCTION_CHANGE_WINDOW } from './production-cutover-preflight.mjs';
import { writeCreateOnlyJsonOutput } from './operations-create-only-json-output.mjs';

export const PRODUCTION_SIGNOFF_REQUEST_BUNDLE_CONFIRMATION = 'ACK-P6-PREPARE-SIGNOFF-REQUEST-BUNDLE';
const TARGET_URL = 'https://inventory.safe-link.co.kr';
const RUN_ID = /^[a-f0-9]{8}-[a-f0-9-]{27,35}$/i;
const RELEASE_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ROLES = Object.freeze(['ADMIN', 'MANAGER', 'USER']);
const AREAS = Object.freeze(['BUSINESS', 'SECURITY', 'OPERATIONS']);

export function productionSignoffRequestSetId({
  runId, releaseSha, coreGateSha, rollbackGateSha, resultSetPublicationId, preparedAt
} = {}) {
  return createHash('sha256').update(JSON.stringify({
    runId, releaseSha, coreGateSha, rollbackGateSha, resultSetPublicationId, preparedAt
  })).digest('hex');
}

function waiting(status, missing = []) {
  return {
    status, missing, inputReadAllowed: false, localEvidenceWriteAllowed: false,
    externalSignatureCreated: false, productionGo: false
  };
}

export function evaluateProductionSignoffRequestBundleGate({
  insideWindow = false, inputReferencesReady = false, outputConfigured = false,
  outputExists = false, prepare = false, confirmed = false
} = {}) {
  if (!insideWindow) return waiting('READY_WAIT_APPROVED_CHANGE_WINDOW');
  if (outputExists) return waiting('READY_EXISTING_SIGNOFF_REQUEST_BUNDLE');
  const missing = [];
  if (!inputReferencesReady) missing.push('checkpointReceiptsAndRoleResults');
  if (!outputConfigured) missing.push('signoffRequestBundleOutput');
  if (missing.length) return waiting('READY_WAIT_SIGNOFF_REQUEST_BUNDLE_INPUTS', missing);
  if (!prepare) return waiting('PASS_SIGNOFF_REQUEST_BUNDLE_DRY_RUN_READY');
  if (!confirmed) return waiting('READY_WAIT_SIGNOFF_REQUEST_BUNDLE_CONFIRMATION');
  return {
    status: 'READY_PREPARE_SIGNOFF_REQUEST_BUNDLE', missing: [], inputReadAllowed: true,
    localEvidenceWriteAllowed: true, externalSignatureCreated: false, productionGo: false
  };
}

function validRoleResult(value, { role, runId, releaseSha, coreGateSha, resultSetPublicationId, checkedAt }) {
  return value?.schemaVersion === 1 && value?.template === false
    && value?.evidenceType === 'P6_ROLE_UAT_RESULT_ACTUAL'
    && value?.environment === 'production' && value?.activationState === 'actual'
    && value?.targetUrl === TARGET_URL && value?.releaseTag === `sha-${releaseSha}`
    && value?.runId === runId && value?.role === role && value?.status === 'PASS'
    && value?.actualProduction === true && value?.resultSetPublicationId === resultSetPublicationId
    && value?.coreSmokeGateReceiptSha256 === coreGateSha && SHA256.test(value?.roleSmokeStepReceiptSha256 || '')
    && value?.checkedAt === checkedAt;
}

export function buildProductionSignoffRequestBundle({
  runId, releaseSha, coreGateSha, rollbackGateSha, roleResultDocuments = {}, preparedAt
} = {}) {
  if (!RUN_ID.test(runId || '') || !RELEASE_SHA.test(releaseSha || '')
    || !SHA256.test(coreGateSha || '') || !SHA256.test(rollbackGateSha || '')) {
    throw new Error('SIGNOFF_REQUEST_PROVENANCE_INVALID');
  }
  const first = roleResultDocuments.ADMIN;
  const resultSetPublicationId = first?.resultSetPublicationId;
  const checkedAt = first?.checkedAt;
  if (!SHA256.test(resultSetPublicationId || '') || !ROLES.every((role) => validRoleResult(roleResultDocuments[role], {
    role, runId, releaseSha, coreGateSha, resultSetPublicationId, checkedAt
  }))) throw new Error('ROLE_RESULT_SET_INVALID');
  const preparedAtMs = Date.parse(preparedAt);
  if (!Number.isFinite(preparedAtMs) || new Date(preparedAtMs).toISOString() !== preparedAt
    || preparedAtMs < Date.parse(checkedAt) || preparedAtMs < Date.parse(PRODUCTION_CHANGE_WINDOW.start)
    || preparedAtMs > Date.parse(PRODUCTION_CHANGE_WINDOW.rollbackCutoff)) {
    throw new Error('PREPARED_AT_INVALID');
  }
  const requestSetId = productionSignoffRequestSetId({
    runId, releaseSha, coreGateSha, rollbackGateSha, resultSetPublicationId, preparedAt
  });
  const signoffPayloads = Object.fromEntries(AREAS.map((area) => [area, {
    schemaVersion: 1, template: true, evidenceType: 'P6_CUTOVER_SIGNOFF_ACTUAL',
    environment: 'production', activationState: 'actual', targetUrl: TARGET_URL,
    releaseTag: `sha-${releaseSha}`, runId, area, decision: 'NOT_RUN',
    signedByRef: null, signedAt: null, coreSmokeGateReceiptSha256: coreGateSha,
    roleResultSetPublicationId: resultSetPublicationId,
    preSignoffRollbackGateReceiptSha256: rollbackGateSha,
    signoffRequestSetId: requestSetId, signoffRequestPreparedAt: preparedAt,
    signoffRequestBundleSha256: null
  }]));
  return {
    schemaVersion: 1, template: true, evidenceType: 'P6_CUTOVER_SIGNOFF_REQUEST_SET',
    environment: 'production', activationState: 'request', targetUrl: TARGET_URL,
    releaseSha, releaseTag: `sha-${releaseSha}`, runId, requestSetId, preparedAt,
    roleResultSetPublicationId: resultSetPublicationId,
    preSignoffRollbackGateReceiptSha256: rollbackGateSha,
    signoffPayloads, signerInstructions: {
      setTemplateFalse: true,
      setDecisionApproved: true,
      fillOnly: ['signedByRef', 'signedAt', 'signoffRequestBundleSha256'],
      preserveProvenanceFields: true
    },
    externalSignatureCreated: false, productionGo: false
  };
}

export function writeProductionSignoffRequestBundle(outputPath, value, {
  io, repositoryRoot = process.cwd(), processId = process.pid
} = {}) {
  const output = path.resolve(outputPath);
  const repository = path.resolve(repositoryRoot);
  if (output.toLowerCase() === repository.toLowerCase()
    || output.toLowerCase().startsWith(`${repository.toLowerCase()}${path.sep}`)) {
    throw new Error('SIGNOFF_REQUEST_BUNDLE_OUTPUT_MUST_BE_EXTERNAL');
  }
  return writeCreateOnlyJsonOutput(output, value, {
    ...(io ? { io } : {}), processId,
    alreadyExistsCode: 'SIGNOFF_REQUEST_BUNDLE_ALREADY_EXISTS'
  });
}
