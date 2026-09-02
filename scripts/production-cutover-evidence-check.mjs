import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import gates from '../src/operations/gates.js';
import { assembleProductionCutoverEvidence } from '../src/operations/production-cutover-evidence.mjs';
import { readOperationsPreflightManifest } from '../src/operations/operations-preflight-manifest-runtime.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (...segments) => JSON.parse(fs.readFileSync(path.join(projectDir, ...segments), 'utf8'));
const g3 = readJson('agent docs', 'harness', 'P6_G3_AI_PC_PRODUCTION_DEPLOY_ROLLBACK_EVIDENCE.json');
const g4 = readJson('agent docs', 'harness', 'P6_G4_CUTOVER_PREFLIGHT_EVIDENCE.json');
const p5 = readJson('agent docs', 'harness', 'P5_G2_STAGING_UAT_SIGNOFF_EVIDENCE.json');
const provider = readJson('agent docs', 'harness', 'P6_G4_PROVIDER_PREFLIGHT_EVIDENCE.json');
const candidate = readOperationsPreflightManifest(
  path.join(projectDir, 'agent docs', 'harness', 'P6_G4_CUTOVER_EVIDENCE_CANDIDATE.json')
).value;
const expected = assembleProductionCutoverEvidence({ g3, g4, p5, provider });

assert.deepEqual(candidate, expected, 'Cutover evidence candidate drifted from verified source evidence.');
assert.equal(candidate.localGatePassCount, 4);
assert.equal(candidate.pendingGateCount, 8);
assert.equal(candidate.productionGo, false);

const validation = gates.validateCutoverEvidence(candidate);
assert.equal(validation.ok, false, 'Candidate evidence must not authorize Production cutover.');
for (const id of ['health_readiness', 'core_smoke', 'logs_5xx', 'uat_signoff']) {
  assert.ok(validation.failures.some((failure) => failure.includes(`${id} must be PASS`)), `${id} must remain fail-closed.`);
}
for (const role of ['business', 'security', 'operations']) {
  assert.ok(validation.failures.includes(`${role} approval is required`));
}

console.log(JSON.stringify({
  status: 'PASS_CANDIDATE_FAIL_CLOSED',
  releaseTag: candidate.releaseTag,
  targetUrl: candidate.targetUrl,
  localGatePassCount: candidate.localGatePassCount,
  pendingGateCount: candidate.pendingGateCount,
  productionGo: candidate.productionGo,
  validatorFailureCount: validation.failures.length
}, null, 2));
