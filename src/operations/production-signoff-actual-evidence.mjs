import fs from 'node:fs';
import path from 'node:path';
import { productionSignoffRequestSetId } from './production-signoff-request-bundle.mjs';
import { PRODUCTION_CHANGE_WINDOW } from './production-cutover-preflight.mjs';
import {
  assertCreateOnlyJsonOutputReady,
  writeCreateOnlyJsonOutput
} from './operations-create-only-json-output.mjs';

export const PRODUCTION_ACTUAL_SIGNOFF_CONFIRMATION = 'ACK-P6-ASSEMBLE-ACTUAL-SIGNOFF-DOCUMENTS';
export const PRODUCTION_ACTUAL_SIGNOFF_AREAS = Object.freeze(['BUSINESS', 'SECURITY', 'OPERATIONS']);
const TARGET_URL = 'https://inventory.safe-link.co.kr';
const RUN_ID = /^[a-f0-9]{8}-[a-f0-9-]{27,35}$/i;
const RELEASE_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTITY = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const RECEIPT_ID = /^[A-Za-z0-9._:-]{8,160}$/;

function waiting(status, missing = []) {
  return {
    status, missing, inputReadAllowed: false, localEvidenceWriteAllowed: false,
    externalApprovalCreated: false, productionGo: false
  };
}

export function evaluateProductionActualSignoffGate({
  insideWindow = false, inputReferencesReady = false, outputsConfigured = false,
  outputsExist = false, assemble = false, confirmed = false
} = {}) {
  if (!insideWindow) return waiting('READY_WAIT_APPROVED_CHANGE_WINDOW');
  if (outputsExist) return waiting('READY_EXISTING_ACTUAL_SIGNOFF_OUTPUT');
  const missing = [];
  if (!inputReferencesReady) missing.push('signoffRequestBundleAndMfaApprovalReceipts');
  if (!outputsConfigured) missing.push('actualSignoffOutputs');
  if (missing.length) return waiting('READY_WAIT_ACTUAL_SIGNOFF_INPUTS', missing);
  if (!assemble) return waiting('PASS_ACTUAL_SIGNOFF_ASSEMBLER_DRY_RUN_READY');
  if (!confirmed) return waiting('READY_WAIT_ACTUAL_SIGNOFF_CONFIRMATION');
  return {
    status: 'READY_ASSEMBLE_ACTUAL_SIGNOFF_DOCUMENTS', missing: [],
    inputReadAllowed: true, localEvidenceWriteAllowed: true,
    externalApprovalCreated: false, productionGo: false
  };
}

function withinApprovalWindow(value, preparedAt) {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value
    && time >= Date.parse(preparedAt)
    && time >= Date.parse(PRODUCTION_CHANGE_WINDOW.start)
    && time <= Date.parse(PRODUCTION_CHANGE_WINDOW.rollbackCutoff);
}

function validUnsignedPayload(payload, bundle, area) {
  return payload?.schemaVersion === 1 && payload?.template === true
    && payload?.evidenceType === 'P6_CUTOVER_SIGNOFF_ACTUAL'
    && payload?.environment === 'production' && payload?.activationState === 'actual'
    && payload?.targetUrl === TARGET_URL && payload?.releaseTag === bundle.releaseTag
    && payload?.runId === bundle.runId && payload?.area === area && payload?.decision === 'NOT_RUN'
    && payload?.signedByRef === null && payload?.signedAt === null
    && payload?.coreSmokeGateReceiptSha256 === bundle.signoffPayloads.BUSINESS.coreSmokeGateReceiptSha256
    && payload?.roleResultSetPublicationId === bundle.roleResultSetPublicationId
    && payload?.preSignoffRollbackGateReceiptSha256 === bundle.preSignoffRollbackGateReceiptSha256
    && payload?.signoffRequestSetId === bundle.requestSetId
    && payload?.signoffRequestPreparedAt === bundle.preparedAt
    && payload?.signoffRequestBundleSha256 === null && payload?.approvalReceiptSha256 === null;
}

function validUnsignedReceiptPayload(payload, bundle, area) {
  return payload?.schemaVersion === 1 && payload?.template === true
    && payload?.evidenceType === 'P6_CUTOVER_SIGNOFF_APPROVAL_RECEIPT_ACTUAL'
    && payload?.environment === 'production' && payload?.activationState === 'actual'
    && payload?.targetUrl === TARGET_URL && payload?.releaseTag === bundle.releaseTag
    && payload?.runId === bundle.runId && payload?.area === area && payload?.decision === 'NOT_RUN'
    && payload?.signedByRef === null && payload?.signedAt === null && payload?.receiptId === null
    && payload?.authentication?.method === 'MFA' && payload?.authentication?.providerRef === null
    && payload?.authentication?.verified === false && payload?.signoffRequestSetId === bundle.requestSetId
    && payload?.signoffRequestBundleSha256 === null;
}

function assertRequestBundle(document) {
  const bundle = document?.value;
  const coreGateSha = bundle?.signoffPayloads?.BUSINESS?.coreSmokeGateReceiptSha256;
  const expectedRequestSetId = productionSignoffRequestSetId({
    runId: bundle?.runId, releaseSha: bundle?.releaseSha, coreGateSha,
    rollbackGateSha: bundle?.preSignoffRollbackGateReceiptSha256,
    resultSetPublicationId: bundle?.roleResultSetPublicationId, preparedAt: bundle?.preparedAt
  });
  const preparedAt = Date.parse(bundle?.preparedAt);
  const valid = SHA256.test(document?.sha256 || '') && bundle?.schemaVersion === 1
    && bundle?.template === true && bundle?.evidenceType === 'P6_CUTOVER_SIGNOFF_REQUEST_SET'
    && bundle?.environment === 'production' && bundle?.activationState === 'request'
    && bundle?.targetUrl === TARGET_URL && RELEASE_SHA.test(bundle?.releaseSha || '')
    && bundle?.releaseTag === `sha-${bundle.releaseSha}` && RUN_ID.test(bundle?.runId || '')
    && SHA256.test(coreGateSha || '') && SHA256.test(bundle?.roleResultSetPublicationId || '')
    && SHA256.test(bundle?.preSignoffRollbackGateReceiptSha256 || '')
    && Number.isFinite(preparedAt) && new Date(preparedAt).toISOString() === bundle.preparedAt
    && preparedAt >= Date.parse(PRODUCTION_CHANGE_WINDOW.start)
    && preparedAt <= Date.parse(PRODUCTION_CHANGE_WINDOW.rollbackCutoff)
    && bundle?.requestSetId === expectedRequestSetId
    && JSON.stringify(Object.keys(bundle?.signoffPayloads || {})) === JSON.stringify(PRODUCTION_ACTUAL_SIGNOFF_AREAS)
    && PRODUCTION_ACTUAL_SIGNOFF_AREAS.every((area) => validUnsignedPayload(bundle.signoffPayloads[area], bundle, area))
    && JSON.stringify(Object.keys(bundle?.approvalReceiptPayloads || {})) === JSON.stringify(PRODUCTION_ACTUAL_SIGNOFF_AREAS)
    && PRODUCTION_ACTUAL_SIGNOFF_AREAS.every((area) => validUnsignedReceiptPayload(bundle.approvalReceiptPayloads[area], bundle, area))
    && bundle?.signerInstructions?.setTemplateFalse === true
    && bundle?.signerInstructions?.setDecisionApproved === true
    && JSON.stringify(bundle?.signerInstructions?.fillOnly) === JSON.stringify(['signedByRef', 'signedAt', 'signoffRequestBundleSha256', 'approvalReceiptSha256'])
    && JSON.stringify(bundle?.signerInstructions?.approvalReceiptFillOnly) === JSON.stringify(['signedByRef', 'signedAt', 'receiptId', 'authentication.providerRef', 'authentication.verified', 'signoffRequestBundleSha256'])
    && bundle?.signerInstructions?.preserveProvenanceFields === true
    && bundle?.externalSignatureCreated === false && bundle?.productionGo === false;
  if (!valid) throw new Error('SIGNOFF_REQUEST_BUNDLE_INVALID');
  return bundle;
}

function validApprovalReceipt(document, template, bundle, bundleSha, area) {
  const receipt = document?.value;
  return SHA256.test(document?.sha256 || '') && receipt?.schemaVersion === template.schemaVersion
    && receipt?.template === false && receipt?.evidenceType === template.evidenceType
    && receipt?.environment === template.environment && receipt?.activationState === template.activationState
    && receipt?.targetUrl === template.targetUrl && receipt?.releaseTag === template.releaseTag
    && receipt?.runId === template.runId && receipt?.area === area && receipt?.decision === 'APPROVED'
    && IDENTITY.test(receipt?.signedByRef || '') && withinApprovalWindow(receipt?.signedAt, bundle.preparedAt)
    && RECEIPT_ID.test(receipt?.receiptId || '') && receipt?.authentication?.method === 'MFA'
    && IDENTITY.test(receipt?.authentication?.providerRef || '') && receipt?.authentication?.verified === true
    && receipt?.signoffRequestSetId === template.signoffRequestSetId
    && receipt?.signoffRequestBundleSha256 === bundleSha;
}

export function assembleProductionActualSignoffDocuments({
  requestBundleDocument, approvalReceiptDocuments = {}
} = {}) {
  const bundle = assertRequestBundle(requestBundleDocument);
  const receiptIds = [];
  for (const area of PRODUCTION_ACTUAL_SIGNOFF_AREAS) {
    const document = approvalReceiptDocuments[area];
    if (!validApprovalReceipt(document, bundle.approvalReceiptPayloads[area], bundle, requestBundleDocument.sha256, area)) {
      throw new Error(`APPROVAL_RECEIPT_INVALID:${area}`);
    }
    receiptIds.push(document.value.receiptId);
  }
  if (new Set(receiptIds).size !== PRODUCTION_ACTUAL_SIGNOFF_AREAS.length) {
    throw new Error('APPROVAL_RECEIPT_IDS_NOT_UNIQUE');
  }
  const documents = Object.fromEntries(PRODUCTION_ACTUAL_SIGNOFF_AREAS.map((area) => {
    const receipt = approvalReceiptDocuments[area];
    return [area, {
      ...bundle.signoffPayloads[area], template: false, decision: 'APPROVED',
      signedByRef: receipt.value.signedByRef, signedAt: receipt.value.signedAt,
      signoffRequestBundleSha256: requestBundleDocument.sha256,
      approvalReceiptSha256: receipt.sha256
    }];
  }));
  return {
    status: 'PASS_PRODUCTION_ACTUAL_SIGNOFF_DOCUMENTS_ASSEMBLED', failures: [], documents,
    externalApprovalCreated: false, productionGo: false
  };
}

export function writeProductionActualSignoffDocuments(outputPaths, documents, {
  io = fs, repositoryRoot = process.cwd(), processId = process.pid
} = {}) {
  const outputs = PRODUCTION_ACTUAL_SIGNOFF_AREAS.map((area) => {
    const candidate = outputPaths?.[area];
    if (typeof candidate !== 'string' || !candidate) throw new Error('ACTUAL_SIGNOFF_OUTPUT_INVALID');
    return [area, path.resolve(candidate)];
  });
  const repo = path.resolve(repositoryRoot).toLowerCase();
  if (new Set(outputs.map(([, output]) => output.toLowerCase())).size !== outputs.length) {
    throw new Error('ACTUAL_SIGNOFF_OUTPUT_PATHS_MUST_BE_DISTINCT');
  }
  for (const [, output] of outputs) {
    if (output.toLowerCase() === repo || output.toLowerCase().startsWith(`${repo}${path.sep}`)) {
      throw new Error('ACTUAL_SIGNOFF_OUTPUT_MUST_BE_EXTERNAL');
    }
    assertCreateOnlyJsonOutputReady(output, { io, alreadyExistsCode: 'ACTUAL_SIGNOFF_OUTPUT_ALREADY_EXISTS' });
  }
  const published = [];
  try {
    for (const [index, [area, output]] of outputs.entries()) {
      writeCreateOnlyJsonOutput(output, documents[area], {
        io, processId: processId + index, alreadyExistsCode: 'ACTUAL_SIGNOFF_OUTPUT_ALREADY_EXISTS'
      });
      published.push(output);
    }
    return Object.fromEntries(outputs);
  } catch (error) {
    if (published.length) throw new Error(`ACTUAL_SIGNOFF_OUTPUT_SET_PARTIAL_COMMIT:${published.length}_OF_${outputs.length}`);
    throw error;
  }
}

