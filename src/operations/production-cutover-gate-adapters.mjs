import { CUTOVER_GATE_SEQUENCE } from './production-cutover-orchestrator.mjs';

export const CUTOVER_GATE_ADAPTER_PLAN = Object.freeze({
  artifact: [
    { id: 'cutover-preflight', script: 'scripts/production-cutover-preflight.mjs', args: [], acceptedStatuses: ['READY_FOR_CHANGE_WINDOW_EXECUTION', 'READY_FOR_CUTOVER_SIGNOFF'] }
  ],
  backup_restore: [
    { id: 'rollback-readiness', script: 'scripts/production-rollback-readiness.mjs', args: [], acceptedStatuses: ['PASS_ROLLBACK_READINESS_DRY_RUN_ONLY'] }
  ],
  migration_review: [
    { id: 'migration-verify', script: 'scripts/db-verify-migrations.mjs', args: [], acceptedStatuses: ['PASS_EXIT_ZERO'] }
  ],
  provider_preflight: [
    { id: 'provider-preflight', script: 'scripts/production-provider-preflight.mjs', args: [], acceptedStatuses: ['PASS'] }
  ],
  health_readiness: [
    { id: 'ingress-publication', script: 'scripts/production-ingress-publication.mjs', args: ['--execute'], acceptedStatuses: ['PASS_INGRESS_PUBLISHED_READY_FOR_TLS_PROBE'] },
    { id: 'public-probe', script: 'scripts/production-public-probe.mjs', args: [], acceptedStatuses: ['PASS_PUBLIC_HEALTH_READINESS'] }
  ],
  core_smoke: [
    { id: 'uat-actor-provision', script: 'scripts/production-uat-actor-provision.mjs', args: ['--execute'], acceptedStatuses: ['PASS_PRODUCTION_UAT_ACTORS_PROVISIONED'] },
    { id: 'role-core-smoke', script: 'scripts/production-role-core-smoke.mjs', args: ['--public'], acceptedStatuses: ['PASS_PRODUCTION_ROLE_CORE_SMOKE'] }
  ],
  csrf_idempotency: [
    { id: 'authenticated-idempotency', script: 'scripts/production-authenticated-idempotency.mjs', args: ['--public'], acceptedStatuses: ['PASS_AUTHENTICATED_CSRF_IDEMPOTENCY'] }
  ],
  logs_5xx: [
    { id: 'log-gate', script: 'scripts/production-log-gate.mjs', args: [], acceptedStatuses: ['PASS_LOGS_5XX'] }
  ],
  nonfunctional: [
    { id: 'nonfunctional-public', script: 'scripts/production-nonfunctional-baseline.mjs', args: ['--public'], acceptedStatuses: ['PASS_ACTUAL_PUBLIC_NONFUNCTIONAL_GATE'] }
  ],
  operational_health: [
    { id: 'operational-health-public', script: 'scripts/production-operational-health-baseline.mjs', args: ['--public'], acceptedStatuses: ['PASS_ACTUAL_POST_CUTOVER_OPERATIONAL_HEALTH'] }
  ],
  rollback: [
    { id: 'rollback-readiness-final', script: 'scripts/production-rollback-readiness.mjs', args: [], acceptedStatuses: ['PASS_ROLLBACK_READINESS_DRY_RUN_ONLY'] }
  ],
  uat_signoff: [
    { id: 'signoff-preflight', script: 'scripts/production-signoff-preflight.mjs', args: [], acceptedStatuses: ['READY_FOR_UAT_SIGNOFF_VALIDATION'] }
  ]
});

export const CUTOVER_ROUTE_DISABLE_ADAPTER = Object.freeze({
  id: 'route-disable',
  script: 'scripts/production-route-disable.mjs',
  args: ['--execute'],
  acceptedStatuses: ['PASS_PUBLIC_ROUTE_DISABLED']
});

export const CUTOVER_INGRESS_ORPHAN_RECOVERY_ADAPTER = Object.freeze({
  id: 'ingress-orphan-recovery',
  script: 'scripts/production-ingress-orphan-recovery.mjs',
  args: ['--execute'],
  acceptedStatuses: [
    'PASS_NO_INGRESS_PARTIAL_STATE',
    'PASS_NO_INGRESS_RECOVERY_TARGET_PROCESS_UNOBSERVED',
    'PASS_INGRESS_PUBLICATION_COMPLETE_NOT_ORPHANED',
    'PASS_INGRESS_ORPHAN_RECOVERED'
  ]
});

function validatePlanContract(plan) {
  const keys = plan && typeof plan === 'object' ? Object.keys(plan) : [];
  if (JSON.stringify(keys) !== JSON.stringify(CUTOVER_GATE_SEQUENCE)) throw new Error('CUTOVER_GATE_ADAPTER_ORDER_INVALID');
  for (const gate of CUTOVER_GATE_SEQUENCE) {
    if (!Array.isArray(plan[gate]) || plan[gate].length === 0) throw new Error(`CUTOVER_GATE_ADAPTER_STEPS_MISSING:${gate}`);
    for (const step of plan[gate]) {
      if (typeof step.id !== 'string' || typeof step.script !== 'string' || !Array.isArray(step.args)
        || !Array.isArray(step.acceptedStatuses) || step.acceptedStatuses.length === 0) {
        throw new Error(`CUTOVER_GATE_ADAPTER_STEP_INVALID:${gate}`);
      }
    }
  }
}

function passedStep(step, outcome) {
  return outcome?.exitCode === 0
    && step.acceptedStatuses.includes(outcome.status)
    && typeof outcome.evidenceRef === 'string'
    && outcome.evidenceRef.trim().length > 0;
}

export function createCutoverGateHandlers({
  runStep,
  recordGateEvidence,
  plan = CUTOVER_GATE_ADAPTER_PLAN
} = {}) {
  validatePlanContract(plan);
  if (typeof runStep !== 'function' || typeof recordGateEvidence !== 'function') {
    throw new Error('CUTOVER_GATE_ADAPTER_DEPENDENCY_INVALID');
  }
  return Object.fromEntries(CUTOVER_GATE_SEQUENCE.map((gate) => [gate, async () => {
    const stepEvidenceRefs = [];
    for (const step of plan[gate]) {
      const outcome = await runStep({ gate, ...step });
      if (!passedStep(step, outcome)) {
        return { status: 'FAIL', reason: `CUTOVER_GATE_STEP_NOT_PASS:${gate}:${step.id}` };
      }
      stepEvidenceRefs.push(outcome.evidenceRef.trim());
    }
    const evidenceRef = await recordGateEvidence({ gate, stepEvidenceRefs });
    if (typeof evidenceRef !== 'string' || evidenceRef.trim().length === 0) {
      return { status: 'FAIL', reason: `CUTOVER_GATE_EVIDENCE_NOT_RECORDED:${gate}` };
    }
    return { status: 'PASS', evidenceRef: evidenceRef.trim() };
  }]));
}

export function createCutoverRouteDisableHandler({ runStep, recordGateEvidence } = {}) {
  if (typeof runStep !== 'function' || typeof recordGateEvidence !== 'function') {
    throw new Error('CUTOVER_ROUTE_DISABLE_ADAPTER_DEPENDENCY_INVALID');
  }
  return async ({ failedGate, failureReason } = {}) => {
    const outcome = await runStep({ gate: 'route_disable', ...CUTOVER_ROUTE_DISABLE_ADAPTER });
    if (!passedStep(CUTOVER_ROUTE_DISABLE_ADAPTER, outcome)) {
      return { status: 'FAIL_PUBLIC_ROUTE_DISABLE_NOT_VERIFIED', evidenceRef: '' };
    }

    const orphanRecoveryRequired = failedGate === 'health_readiness'
      && /:ingress-publication$/.test(String(failureReason || ''));
    let orphanRecoveryEvidenceRef = '';
    if (orphanRecoveryRequired) {
      const recoveryOutcome = await runStep({
        gate: 'ingress_orphan_recovery',
        ...CUTOVER_INGRESS_ORPHAN_RECOVERY_ADAPTER
      });
      if (!passedStep(CUTOVER_INGRESS_ORPHAN_RECOVERY_ADAPTER, recoveryOutcome)) {
        return {
          status: 'FAIL_INGRESS_ORPHAN_RECOVERY_NOT_VERIFIED',
          evidenceRef: '',
          orphanRecoveryRequired: true,
          orphanRecoveryVerified: false,
          orphanRecoveryEvidenceRef: ''
        };
      }
      orphanRecoveryEvidenceRef = recoveryOutcome.evidenceRef.trim();
    }
    const stepEvidenceRefs = [outcome.evidenceRef.trim()];
    if (orphanRecoveryEvidenceRef) stepEvidenceRefs.push(orphanRecoveryEvidenceRef);
    const evidenceRef = await recordGateEvidence({
      gate: 'route_disable',
      failedGate,
      failureReason,
      stepEvidenceRefs
    });
    return typeof evidenceRef === 'string' && evidenceRef.trim().length > 0
      ? {
          status: 'PASS_PUBLIC_ROUTE_DISABLED',
          evidenceRef: evidenceRef.trim(),
          orphanRecoveryRequired,
          orphanRecoveryVerified: orphanRecoveryRequired,
          orphanRecoveryEvidenceRef
        }
      : { status: 'FAIL_PUBLIC_ROUTE_DISABLE_EVIDENCE_NOT_RECORDED', evidenceRef: '' };
  };
}
