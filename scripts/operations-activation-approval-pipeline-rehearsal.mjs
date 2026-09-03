import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOperationsActivationApprovalPipelineRehearsal } from '../src/operations/operations-activation-approval-pipeline-rehearsal.mjs';
import { computeOperationsActivationBundleSha256 } from '../src/operations/operations-activation-orchestrator.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = runOperationsActivationApprovalPipelineRehearsal({
  activationBundleSha256: computeOperationsActivationBundleSha256(projectRoot)
});
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...result, productionGo: false }, null, 2));
