import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPERATIONS_ACTIVATION_BUNDLE_ENTRYPOINTS,
  computeOperationsActivationBundleSha256,
  resolveOperationsActivationBundleFiles
} from '../src/operations/operations-activation-orchestrator.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = resolveOperationsActivationBundleFiles(projectRoot);

console.log(JSON.stringify({
  status: 'PASS_OPERATIONS_ACTIVATION_BUNDLE_DIGEST',
  rootEntrypointCount: OPERATIONS_ACTIVATION_BUNDLE_ENTRYPOINTS.length,
  resolvedPhysicalFileCount: files.length,
  activationBundleSha256: computeOperationsActivationBundleSha256(projectRoot),
  secretValuesReadOrRecorded: false,
  changesMade: false
}, null, 2));
