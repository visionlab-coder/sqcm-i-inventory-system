const REQUIRED_SECRET_REFS = [
  'OIDC_CLIENT_SECRET',
  'STORAGE_CREDENTIALS',
  'MALWARE_SCANNER_TOKEN',
  'EVENT_PUBLISHER_TOKEN',
  'ALERTING_TOKEN',
  'AI_PROVIDER_API_KEY',
  'SESSION_SECRET',
  'MFA_ENCRYPTION_KEY',
  'POSTGRES_PASSWORD'
];

const REQUIRED_CUTOVER_GATES = [
  'artifact',
  'backup_restore',
  'migration_review',
  'provider_preflight',
  'health_readiness',
  'core_smoke',
  'logs_5xx',
  'rollback',
  'csrf_idempotency',
  'operational_health',
  'nonfunctional',
  'uat_signoff'
];

function isHttps(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isSecretReference(value) {
  return typeof value === 'string' && /^(secret|vault|aws-secretsmanager|azure-keyvault):\/\/[A-Za-z0-9._/@:-]+$/.test(value);
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function validateOperationsManifest(manifest) {
  const failures = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, failures: ['manifest must be an object'] };
  }
  if (manifest.schemaVersion !== 1) failures.push('schemaVersion must be 1');
  if (!['staging', 'production'].includes(manifest.environment)) failures.push('environment must be staging or production');
  if (!isHttps(manifest.publicBaseUrl)) failures.push('publicBaseUrl must use HTTPS');

  const oidc = manifest.providers?.oidc || {};
  if (!isHttps(oidc.issuer)) failures.push('providers.oidc.issuer must use HTTPS');
  if (typeof oidc.clientId !== 'string' || oidc.clientId.trim().length < 3) failures.push('providers.oidc.clientId is required');
  if (!isHttps(oidc.redirectUri)) failures.push('providers.oidc.redirectUri must use HTTPS');
  if (isHttps(manifest.publicBaseUrl) && isHttps(oidc.redirectUri) && !oidc.redirectUri.startsWith(manifest.publicBaseUrl.replace(/\/$/, ''))) {
    failures.push('OIDC redirectUri must belong to publicBaseUrl');
  }

  const storage = manifest.providers?.storage || {};
  if (!isHttps(storage.endpoint)) failures.push('providers.storage.endpoint must use HTTPS');
  if (typeof storage.bucket !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,62}$/.test(storage.bucket)) failures.push('providers.storage.bucket is invalid');

  const malware = manifest.providers?.malwareScanner || {};
  if (!isHttps(malware.endpoint)) failures.push('providers.malwareScanner.endpoint must use HTTPS');
  if (!positiveInteger(malware.timeoutMs) || malware.timeoutMs > 120000) failures.push('malware scanner timeoutMs must be 1..120000');

  for (const name of ['eventPublisher','alerting']) {
    if (!isHttps(manifest.providers?.[name]?.endpoint)) failures.push(`providers.${name}.endpoint must use HTTPS`);
  }

  const ai = manifest.providers?.ai || {};
  for (const name of ['recommendEndpoint', 'ocrEndpoint', 'healthEndpoint', 'readyEndpoint']) {
    if (!isHttps(ai[name])) failures.push(`providers.ai.${name} must use HTTPS`);
  }
  if (typeof ai.model !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(ai.model)) failures.push('providers.ai.model is invalid');
  if (!positiveInteger(ai.timeoutMs) || ai.timeoutMs > 120000) failures.push('AI provider timeoutMs must be 1..120000');

  const backup = manifest.backup || {};
  if (!isSecretReference(backup.storageRef)) failures.push('backup.storageRef must be a Secret/Vault reference');
  if (!positiveInteger(backup.rpoMinutes)) failures.push('backup.rpoMinutes must be a positive integer');
  if (!positiveInteger(backup.rtoMinutes)) failures.push('backup.rtoMinutes must be a positive integer');
  if (backup.pitrEnabled !== true) failures.push('backup.pitrEnabled must be true');
  if (!isSecretReference(backup.walArchiveRef)) failures.push('backup.walArchiveRef must be a Secret/Vault reference');

  for (const name of REQUIRED_SECRET_REFS) {
    if (!isSecretReference(manifest.secretRefs?.[name])) failures.push(`secretRefs.${name} must be a Secret/Vault reference`);
  }

  return {
    ok: failures.length === 0,
    failures,
    summary: {
      environment: manifest.environment || null,
      publicBaseUrl: manifest.publicBaseUrl || null,
      providers: ['oidc', 'storage', 'malwareScanner', 'eventPublisher', 'alerting', 'ai'],
      secretReferenceCount: Object.keys(manifest.secretRefs || {}).length,
      template: manifest.template === true
    }
  };
}

function validateCutoverEvidence(evidence, { allowTemplate = false } = {}) {
  const failures = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return { ok: false, failures: ['evidence must be an object'] };
  }
  if (evidence.schemaVersion !== 1) failures.push('schemaVersion must be 1');
  if (!allowTemplate && evidence.template === true) failures.push('template evidence cannot authorize a cutover');
  if (typeof evidence.releaseTag !== 'string' || evidence.releaseTag.trim().length < 3) failures.push('releaseTag is required');
  if (!/^https:\/\//.test(evidence.targetUrl || '')) failures.push('targetUrl must use HTTPS');

  const byId = new Map((evidence.gates || []).map((gate) => [gate.id, gate]));
  for (const id of REQUIRED_CUTOVER_GATES) {
    const gate = byId.get(id);
    if (!gate) {
      failures.push(`missing gate: ${id}`);
      continue;
    }
    if (!allowTemplate && gate.status !== 'PASS') failures.push(`${id} must be PASS`);
    if (!allowTemplate && (typeof gate.evidence !== 'string' || gate.evidence.trim().length < 3)) failures.push(`${id} evidence is required`);
  }

  const approvers = evidence.approvals || {};
  for (const role of ['business', 'security', 'operations']) {
    const approval = approvers[role];
    if (!allowTemplate && (!approval || approval.status !== 'APPROVED' || !approval.signedAt || !approval.signedBy)) {
      failures.push(`${role} approval is required`);
    }
  }

  if (!allowTemplate) {
    const pilot = evidence.pilot || {};
    if (Number(pilot.openCriticalDefects) !== 0) failures.push('openCriticalDefects must be 0');
    if (Number(pilot.openHighDefects) !== 0) failures.push('openHighDefects must be 0');
    const roleResults = new Map((pilot.roleResults || []).map(item => [item.role, item]));
    for (const role of ['employee', 'manager', 'admin']) {
      const result = roleResults.get(role);
      if (!result || result.status !== 'PASS' || !result.evidence) failures.push(`${role} pilot UAT PASS evidence is required`);
    }
  }

  return { ok: failures.length === 0, failures, requiredGateCount: REQUIRED_CUTOVER_GATES.length };
}

module.exports = {
  REQUIRED_CUTOVER_GATES,
  REQUIRED_SECRET_REFS,
  isSecretReference,
  validateCutoverEvidence,
  validateOperationsManifest
};
