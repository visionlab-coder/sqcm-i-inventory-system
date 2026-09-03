import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeOperationsActivationBundleSha256 } from '../src/operations/operations-activation-orchestrator.mjs';
import { runOperationsActivationWaitResumeSequenceRehearsal } from '../src/operations/operations-activation-approval-to-orchestrator-rehearsal.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const activationBundleSha256 = computeOperationsActivationBundleSha256(projectRoot);
const result = runOperationsActivationWaitResumeSequenceRehearsal({ activationBundleSha256 });
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2));
