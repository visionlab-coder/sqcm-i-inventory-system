import { runOperationsActivationProcessRunnerRehearsal } from '../src/operations/operations-activation-process-runner-rehearsal.mjs';

const result = runOperationsActivationProcessRunnerRehearsal();
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2));
