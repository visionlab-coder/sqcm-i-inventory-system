const REQUIRED_OUTBOUND_FIELDS = Object.freeze([
  'eventId',
  'type',
  'aggregateType',
  'aggregateId',
  'occurredAt',
  'idempotencyKey',
  'payloadSha256'
]);

const REQUIRED_RECEIPT_FIELDS = Object.freeze(['receiptId', 'receiptStatus']);
const SAFE_REFERENCE = /^(?:secret:\/\/[A-Za-z0-9._\/-]+|\/run\/secrets\/[A-Za-z0-9._-]+)$/;
const PLACEHOLDER_HOST = /(?:^|\.)(?:example\.com|example\.net|example\.org)$/i;
const FORBIDDEN_SECRET_KEY = /^(?:secret|secretValue|token|apiKey|password|credential|credentialValue)$/i;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function valuePresent(value) {
  const item = text(value);
  return item.length >= 2 && !/^\[.*\]$/.test(item);
}

function evidencePresent(value) {
  const ref = text(value);
  return ref.length >= 8 && !/^\[.*\]$/.test(ref);
}

function findRawSecretKey(value, path = '$', findings = []) {
  if (!value || typeof value !== 'object') return findings;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_SECRET_KEY.test(key)) findings.push(`${path}.${key}`);
    findRawSecretKey(child, `${path}.${key}`, findings);
  }
  return findings;
}

function validateEndpoint(value) {
  let url;
  try { url = new URL(text(value)); } catch { return { valid: false }; }
  const valid = url.protocol === 'https:'
    && !url.username
    && !url.password
    && !url.search
    && !url.hash
    && url.hostname.includes('.')
    && !PLACEHOLDER_HOST.test(url.hostname);
  return { valid, scheme: url.protocol, host: url.hostname };
}

function mappingCoverage(mappings) {
  const rows = Array.isArray(mappings) ? mappings : [];
  const validRows = rows.filter((row) => valuePresent(row?.sqcmField)
    && valuePresent(row?.providerField)
    && ['outbound', 'receipt'].includes(row?.direction)
    && ['business', 'identifier', 'financial', 'metadata'].includes(row?.classification));
  const outbound = new Set(validRows.filter((row) => row.direction === 'outbound').map((row) => row.sqcmField));
  const receipt = new Set(validRows.filter((row) => row.direction === 'receipt').map((row) => row.sqcmField));
  return {
    valid: REQUIRED_OUTBOUND_FIELDS.every((field) => outbound.has(field))
      && REQUIRED_RECEIPT_FIELDS.every((field) => receipt.has(field)),
    rows: validRows.length,
    missingOutbound: REQUIRED_OUTBOUND_FIELDS.filter((field) => !outbound.has(field)),
    missingReceipt: REQUIRED_RECEIPT_FIELDS.filter((field) => !receipt.has(field))
  };
}

export function evaluateErpEapprovalProviderInputs(input) {
  const failures = [];
  const rawSecretKeys = findRawSecretKey(input);
  if (rawSecretKeys.length) failures.push('RAW_SECRET_MATERIAL_KEY_PRESENT');

  const product = input?.providerProduct || {};
  const productValid = valuePresent(product.productName)
    && valuePresent(product.vendor)
    && valuePresent(product.apiVersion)
    && evidencePresent(product.evidenceRef);
  if (!productValid) failures.push('PROVIDER_PRODUCT_NOT_EVIDENCED');

  const endpoint = input?.httpsEndpoint || {};
  const endpointCheck = validateEndpoint(endpoint.url);
  const endpointValid = endpointCheck.valid
    && endpoint.environment === 'staging'
    && endpoint.method === 'POST'
    && evidencePresent(endpoint.evidenceRef);
  if (!endpointValid) failures.push('HTTPS_ENDPOINT_NOT_EVIDENCED');

  const mappings = input?.fieldMapping || {};
  const mappingCheck = mappingCoverage(mappings.rows);
  const mappingValid = mappingCheck.valid && evidencePresent(mappings.evidenceRef);
  if (!mappingValid) failures.push('FIELD_MAPPING_NOT_EVIDENCED');

  const secretReference = input?.secretReference || {};
  const secretReferenceValid = SAFE_REFERENCE.test(text(secretReference.reference))
    && evidencePresent(secretReference.evidenceRef)
    && valuePresent(secretReference.rotationOwner)
    && evidencePresent(secretReference.revocationProcedureRef);
  if (!secretReferenceValid) failures.push('SECRET_REFERENCE_NOT_EVIDENCED');

  const owner = input?.testOwner || {};
  const responsibilities = new Set(Array.isArray(owner.responsibilities) ? owner.responsibilities : []);
  const ownerValid = valuePresent(owner.name)
    && valuePresent(owner.title)
    && evidencePresent(owner.evidenceRef)
    && ['execute', 'result-signoff', 'rollback'].every((item) => responsibilities.has(item));
  if (!ownerValid) failures.push('TEST_OWNER_NOT_EVIDENCED');

  const approval = input?.approvalQueue || {};
  const approvalValid = approval.status === 'APPROVED_FOR_STAGING_UAT'
    && valuePresent(approval.approverName)
    && evidencePresent(approval.evidenceRef)
    && Array.isArray(approval.approvedScopes)
    && approval.approvedScopes.includes('STAGING_UAT')
    && approval.approvedScopes.includes('ROLLBACK');
  if (!approvalValid) failures.push('APPROVAL_QUEUE_NOT_RELEASED');

  const ready = failures.length === 0;
  return {
    status: ready ? 'READY_FOR_STAGING_CONTRACT_UAT' : 'HOLD_EXTERNAL_INPUT',
    checks: {
      providerProduct: productValid ? 'PASS' : 'MISSING',
      httpsEndpoint: endpointValid ? 'PASS' : 'MISSING',
      fieldMapping: mappingValid ? 'PASS' : 'MISSING',
      secretReference: secretReferenceValid ? 'PASS' : 'MISSING',
      testOwner: ownerValid ? 'PASS' : 'MISSING',
      approvalQueue: approvalValid ? 'PASS' : 'CONDITIONAL_OR_MISSING'
    },
    endpoint: endpointCheck.valid ? { scheme: endpointCheck.scheme, host: endpointCheck.host } : null,
    mappingCoverage: mappingCheck,
    rawSecretKeys,
    failures,
    externalCallsMade: false,
    deploymentsMade: false,
    approvalOrFinancialDataChangesMade: false
  };
}

export { REQUIRED_OUTBOUND_FIELDS, REQUIRED_RECEIPT_FIELDS };
