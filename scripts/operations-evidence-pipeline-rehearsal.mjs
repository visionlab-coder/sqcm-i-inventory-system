import { runOperationsEvidencePipelineRehearsal } from '../src/operations/operations-evidence-pipeline-rehearsal.mjs';

try {
  const result = runOperationsEvidencePipelineRehearsal();
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    ...result,
    temporaryArtifactsRetained: false,
    secretValuesReadOrRecorded: false
  }, null, 2));
  if (!result.status.startsWith('PASS_')) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    status: 'BLOCKED_SYNTHETIC_OPERATIONS_EVIDENCE_PIPELINE_REHEARSAL',
    failureCount: 1,
    failureCode: error instanceof Error ? error.message.split(':')[0] : 'UNKNOWN',
    syntheticOnly: true,
    actualEvidenceCreated: false,
    temporaryArtifactsRetained: false,
    secretValuesReadOrRecorded: false,
    externalMutationPerformed: false,
    productionGo: false
  }, null, 2));
  process.exitCode = 1;
}
