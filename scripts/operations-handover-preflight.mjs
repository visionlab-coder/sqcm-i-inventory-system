import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateOperationsHandoverPreflight, HANDOVER_DOMAINS } from '../src/operations/operations-handover-preflight.mjs';
import { readOperationsHandoverPreflightControlSnapshot } from '../src/operations/operations-handover-preflight-control-snapshot.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const control = readOperationsHandoverPreflightControlSnapshot(projectDir);
const candidate = control.candidate.value;
const roadmap = control.roadmap.value;
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
