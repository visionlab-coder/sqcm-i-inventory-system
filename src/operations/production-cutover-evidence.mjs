const GATE_IDS = [
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

const LOCAL_PASS_EVIDENCE = Object.freeze({
  artifact: 'P6_G3_AI_PC_PRODUCTION_DEPLOY_ROLLBACK_EVIDENCE.json: immutable candidate SHA and backend/frontend index digests verified',
  backup_restore: 'P6_G3_AI_PC_PRODUCTION_DEPLOY_ROLLBACK_EVIDENCE.json: logical backup SHA-256 and isolated restore 33/33 tables, migrations 25/25 verified',
  migration_review: 'P6_G3_AI_PC_PRODUCTION_DEPLOY_ROLLBACK_EVIDENCE.json: PostgreSQL application migrations 25/25 and seeds disabled',
  provider_preflight: 'P6_G4_PROVIDER_PREFLIGHT_EVIDENCE.json: PostgreSQL storage, Defender/alert, AI health/readiness and event publisher read-only probes verified'
});

export function assembleProductionCutoverEvidence({ g3, g4, p5, provider }) {
  if (g3.status !== 'PASS') throw new Error('P6-G3 evidence must be PASS.');
  if (g4.status !== 'READY_WAIT_CHANGE_WINDOW') throw new Error('P6-G4 preflight must be READY_WAIT_CHANGE_WINDOW.');
  if (p5.status !== 'PASS_SIGNOFF_3_OF_3') throw new Error('P5 staging signoff baseline must be PASS_SIGNOFF_3_OF_3.');
  if (provider.status !== 'PASS' || provider.readOnly !== true || provider.secretMaterialPrinted !== false) {
    throw new Error('P6-G4 provider preflight must be read-only PASS without Secret output.');
  }

  const gates = GATE_IDS.map((id) => ({
    id,
    status: Object.hasOwn(LOCAL_PASS_EVIDENCE, id) ? 'PASS' : 'PENDING',
    evidence: LOCAL_PASS_EVIDENCE[id] || ''
  }));

  return {
    schemaVersion: 1,
    template: false,
    activationState: 'candidate',
    generatedFrom: {
      p6g3: 'agent docs/harness/P6_G3_AI_PC_PRODUCTION_DEPLOY_ROLLBACK_EVIDENCE.json',
      p6g4Preflight: 'agent docs/harness/P6_G4_CUTOVER_PREFLIGHT_EVIDENCE.json',
      p5Signoff: 'agent docs/harness/P5_G2_STAGING_UAT_SIGNOFF_EVIDENCE.json',
      providerPreflight: 'agent docs/harness/P6_G4_PROVIDER_PREFLIGHT_EVIDENCE.json'
    },
    generatedAt: g4.checkedAt,
    releaseTag: `sha-${g3.source.candidateSha}`,
    targetUrl: 'https://inventory.safe-link.co.kr',
    localGatePassCount: gates.filter((gate) => gate.status === 'PASS').length,
    pendingGateCount: gates.filter((gate) => gate.status === 'PENDING').length,
    gates,
    pilot: {
      openCriticalDefects: null,
      openHighDefects: null,
      stagingBaseline: `${p5.technicalBasis.passed}/${p5.technicalBasis.uatTotal} PASS; Production validation is not run`,
      roleResults: [
        { role: 'employee', status: 'PENDING', evidence: '' },
        { role: 'manager', status: 'PENDING', evidence: '' },
        { role: 'admin', status: 'PENDING', evidence: '' }
      ]
    },
    approvals: {
      business: { status: 'PENDING', signedBy: '', signedAt: '' },
      security: { status: 'PENDING', signedBy: '', signedAt: '' },
      operations: { status: 'PENDING', signedBy: '', signedAt: '' }
    },
    productionGo: false
  };
}

export { GATE_IDS };
