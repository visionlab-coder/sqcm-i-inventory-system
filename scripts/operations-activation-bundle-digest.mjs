import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPERATIONS_ACTIVATION_BUNDLE_ENTRYPOINTS,
  OPERATIONS_ACTIVATION_BUNDLE_FILE_MAX_BYTES,
  OPERATIONS_ACTIVATION_BUNDLE_TOTAL_MAX_BYTES,
  inspectOperationsActivationBundle
} from '../src/operations/operations-activation-orchestrator.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = inspectOperationsActivationBundle(projectRoot);

console.log(JSON.stringify({
  status: 'PASS_OPERATIONS_ACTIVATION_BUNDLE_DIGEST',
  rootEntrypointCount: OPERATIONS_ACTIVATION_BUNDLE_ENTRYPOINTS.length,
  resolvedPhysicalFileCount: bundle.files.length,
  totalBytes: bundle.totalBytes,
  perFileMaximumBytes: OPERATIONS_ACTIVATION_BUNDLE_FILE_MAX_BYTES,
  aggregateMaximumBytes: OPERATIONS_ACTIVATION_BUNDLE_TOTAL_MAX_BYTES,
  activationBundleSha256: bundle.sha256,
  secretValuesReadOrRecorded: false,
  changesMade: false
}, null, 2));
