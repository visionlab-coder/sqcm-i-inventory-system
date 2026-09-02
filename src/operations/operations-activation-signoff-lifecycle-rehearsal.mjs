import os from 'node:os';
import { runOperationsActivationFullSequenceRehearsal } from './operations-activation-approval-to-orchestrator-rehearsal.mjs';
import { runOperationsEvidencePipelineRehearsal } from './operations-evidence-pipeline-rehearsal.mjs';

const TARGET_URL = 'https://inventory.safe-link.co.kr';

export function runOperationsActivationSignoffLifecycleRehearsal({
  activationBundleSha256,
  releaseSha,
  targetUrl = TARGET_URL,
  temporaryBase = os.tmpdir(),
  tamperBoundary = null
} = {}) {
  const activation = runOperationsActivationFullSequenceRehearsal({
    activationBundleSha256, releaseSha, targetUrl, temporaryBase
  });
  const handover = runOperationsEvidencePipelineRehearsal({
    releaseSha: tamperBoundary === 'release' ? '0'.repeat(40) : releaseSha,
    targetUrl,
    tempRoot: temporaryBase
  });
  const observedHandoverTarget = tamperBoundary === 'target'
    ? 'https://tampered.invalid'
    : handover.targetUrl;
  const releaseProvenanceMatched = activation.releaseSha === handover.releaseSha;
  const targetProvenanceMatched = activation.targetUrl === observedHandoverTarget;
  const failures = [];
  if (!releaseProvenanceMatched) failures.push('RELEASE_PROVENANCE_MISMATCH');
  if (!targetProvenanceMatched) failures.push('TARGET_PROVENANCE_MISMATCH');
  if (!activation.sequenceComplete) failures.push('ACTIVATION_SEQUENCE_INCOMPLETE');
  if (!handover.status.startsWith('PASS_')) failures.push('HANDOVER_EVIDENCE_PIPELINE_INCOMPLETE');

  return {
    status: failures.length
      ? 'BLOCKED_SYNTHETIC_OPERATIONS_ACTIVATION_SIGNOFF_LIFECYCLE_REHEARSAL'
      : 'PASS_SYNTHETIC_OPERATIONS_ACTIVATION_SIGNOFF_LIFECYCLE_REHEARSAL',
    failures,
    releaseProvenanceMatched,
    targetProvenanceMatched,
    activationStepCount: activation.activationStepCount,
    activationSequenceComplete: activation.sequenceComplete,
    handoverVerifiedDocumentCount: handover.verifiedDocumentCount,
    temporaryArtifactsRetained: activation.temporaryArtifactsRetained,
    syntheticOnly: true,
    actualActivationExecuted: false,
    actualEvidenceCreated: false,
    externalMutationPerformed: false,
    secretValuesReadOrRecorded: false,
    productionGo: false
  };
}
