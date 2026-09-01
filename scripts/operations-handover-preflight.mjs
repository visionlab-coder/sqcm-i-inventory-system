import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateOperationsHandoverPreflight, HANDOVER_DOMAINS } from '../src/operations/operations-handover-preflight.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidatePath = path.join(projectDir, 'agent docs', 'harness', 'P7_OPERATIONS_HANDOVER_PREFLIGHT_CANDIDATE.json');
const roadmapPath = path.join(projectDir, 'agent docs', 'harness', 'MASTER_ROADMAP.json');
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8'));
const p6 = roadmap.phases.find((phase) => phase.id === 'P6');
const result = evaluateOperationsHandoverPreflight(candidate, { p6EvidenceComplete: p6?.status === 'evidence-complete' });

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  status: result.status,
  domainCount: HANDOVER_DOMAINS.length,
  contractErrorCount: result.contractErrors.length,
  missingInputCount: result.missingInputs.length,
  missingInputs: result.missingInputs,
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7Status: roadmap.phases.find((phase) => phase.id === 'P7')?.status ?? null,
  secretValuesReadOrRecorded: false,
  productionGo: false
}, null, 2));

if (result.status === 'BLOCKED_HANDOVER_CONTRACT_INVALID') process.exitCode = 1;
