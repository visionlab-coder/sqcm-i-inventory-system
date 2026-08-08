const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REQUIRED_CUTOVER_GATES,
  validateCutoverEvidence,
  validateOperationsManifest
} = require('../../src/operations/gates');

function validManifest() {
  return {
    schemaVersion: 1,
    environment: 'staging',
    publicBaseUrl: 'https://inventory.example.com',
    providers: {
      oidc: { issuer: 'https://idp.example.com', clientId: 'inventory', redirectUri: 'https://inventory.example.com/api/auth/oidc/callback' },
      storage: { endpoint: 'https://objects.example.com', bucket: 'inventory-staging' },
      malwareScanner: { endpoint: 'https://scanner.example.com/scan', timeoutMs: 30000 }
    },
    backup: { storageRef: 'secret://inventory/backup', rpoMinutes: 60, rtoMinutes: 120 },
    secretRefs: Object.fromEntries(['OIDC_CLIENT_SECRET','STORAGE_CREDENTIALS','MALWARE_SCANNER_TOKEN','SESSION_SECRET','MFA_ENCRYPTION_KEY','POSTGRES_PASSWORD'].map((name) => [name, `secret://inventory/${name.toLowerCase()}`]))
  };
}

test('운영 manifest는 HTTPS 공급자와 Secret 참조만 허용한다', () => {
  const result = validateOperationsManifest(validManifest());
  assert.equal(result.ok, true);
  assert.equal(result.summary.secretReferenceCount, 6);
});

test('운영 manifest는 평문 Secret과 다른 호스트의 OIDC callback을 거부한다', () => {
  const manifest = validManifest();
  manifest.secretRefs.SESSION_SECRET = 'plain-secret-value';
  manifest.providers.oidc.redirectUri = 'https://attacker.example/callback';
  const result = validateOperationsManifest(manifest);
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /SESSION_SECRET/);
  assert.match(result.failures.join('\n'), /belong to publicBaseUrl/);
});

test('전환 게이트는 9개 증거와 업무·보안·운영 승인을 모두 요구한다', () => {
  const evidence = {
    schemaVersion: 1,
    releaseTag: 'release-2026-08-08',
    targetUrl: 'https://inventory.example.com',
    gates: REQUIRED_CUTOVER_GATES.map((id) => ({ id, status: 'PASS', evidence: `evidence/${id}.txt` })),
    approvals: Object.fromEntries(['business','security','operations'].map((role) => [role, { status: 'APPROVED', signedBy: `${role}-owner`, signedAt: '2026-08-08T00:00:00Z' }]))
  };
  assert.equal(validateCutoverEvidence(evidence).ok, true);
  evidence.gates[0].status = 'PENDING';
  assert.equal(validateCutoverEvidence(evidence).ok, false);
});

test('템플릿은 계약 검사에는 쓰지만 실제 전환 승인은 할 수 없다', () => {
  const evidence = {
    schemaVersion: 1,
    template: true,
    releaseTag: 'TEMPLATE',
    targetUrl: 'https://inventory.example.com',
    gates: REQUIRED_CUTOVER_GATES.map((id) => ({ id, status: 'PENDING', evidence: '' })),
    approvals: {}
  };
  assert.equal(validateCutoverEvidence(evidence, { allowTemplate: true }).ok, true);
  assert.equal(validateCutoverEvidence(evidence).ok, false);
});
