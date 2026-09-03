import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readActualCutoverEvidenceFile,
  validateActualCutoverProvenance
} from '../src/operations/production-cutover-finalizer.mjs';
import {
  P6_TO_P7_PROMOTION_CONFIRMATION,
  evaluateP6ToP7Promotion,
  promoteCurrentStateDocument,
  promoteRoadmapDocument,
  renderHarnessStatusBlock,
} from '../src/operations/production-phase-promotion.mjs';
import { readOperationsPhaseCompletionControlSnapshot } from '../src/operations/operations-phase-completion-control-snapshot.mjs';
import {
  readPhasePromotionTextDocument,
  runPhasePromotionGitStatus
} from '../src/operations/production-phase-promotion-runtime.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const paths = {
  roadmap: path.join(projectRoot, 'agent docs', 'harness', 'MASTER_ROADMAP.json'),
  queue: path.join(projectRoot, 'agent docs', 'harness', 'P6_P7_ACCELERATION_QUEUE.json'),
  currentState: path.join(projectRoot, 'docs', 'current-state.md'),
  roadmapDoc: path.join(projectRoot, 'docs', 'roadmap.md')
};
const evidencePath = process.env.PRODUCTION_CUTOVER_ACTUAL_EVIDENCE_FILE;
const execute = process.argv.includes('--promote');
const physicalExternalEvidence = () => readActualCutoverEvidenceFile(evidencePath, { repositoryRoot: projectRoot });

if (!evidencePath || !fs.existsSync(evidencePath)) {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), status: 'READY_WAIT_ACTUAL_CUTOVER_EVIDENCE_FOR_PHASE_PROMOTION', requiredEnvironment: 'PRODUCTION_CUTOVER_ACTUAL_EVIDENCE_FILE', changesMade: false, productionGo: false }, null, 2));
  process.exit(0);
}

try {
  const evidence = physicalExternalEvidence();
  const validation = validateActualCutoverProvenance(evidence.value);
  if (!validation.productionGo) throw new Error(validation.failures.join(','));
  const control = readOperationsPhaseCompletionControlSnapshot(projectRoot);
  const roadmap = control.roadmap.value;
  const queue = control.queue.value;
  const result = evaluateP6ToP7Promotion({ roadmap, queue, actualEvidence: evidence.value, actualEvidenceSha256: evidence.sha256, execute, confirmation: process.env.P6_TO_P7_PROMOTION_CONFIRMATION });
  if (result.status !== 'READY_APPLY_P6_TO_P7_PROMOTION') {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...result, expectedConfirmation: P6_TO_P7_PROMOTION_CONFIRMATION }, null, 2));
    if (result.status.startsWith('FAIL_')) process.exitCode = 1;
  } else {
    if (!runPhasePromotionGitStatus({ projectRoot }).clean) throw new Error('PROMOTION_REQUIRES_CLEAN_WORKTREE');
    const currentStateDocument = readPhasePromotionTextDocument({ projectRoot, filePath: paths.currentState });
    const roadmapDocument = readPhasePromotionTextDocument({ projectRoot, filePath: paths.roadmapDoc });
    const readyWork = result.nextRoadmap.phases.find((phase) => phase.id === 'P7').readyWork.id;
    const block = renderHarnessStatusBlock({ completedPhases: 7, totalPhases: 8, currentPhase: 'P7', productionGo: true, readyWork });
    const nextFiles = new Map([
      [paths.roadmap, `${JSON.stringify(result.nextRoadmap, null, 2)}\n`],
      [paths.queue, `${JSON.stringify(result.nextQueue, null, 2)}\n`],
      [paths.currentState, promoteCurrentStateDocument(currentStateDocument.text, block)],
      [paths.roadmapDoc, promoteRoadmapDocument(roadmapDocument.text, block)]
    ]);
    const originals = new Map([
      [paths.roadmap, control.roadmap.raw],
      [paths.queue, control.queue.raw],
      [paths.currentState, currentStateDocument.raw],
      [paths.roadmapDoc, roadmapDocument.raw]
    ]);
    try {
      for (const [file, content] of nextFiles) fs.writeFileSync(file, content, { encoding: 'utf8' });
    } catch (error) {
      for (const [file, content] of originals) fs.writeFileSync(file, content);
      throw error;
    }
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), status: 'PASS_P6_COMPLETE_P7_OPENED', modifiedFileCount: 4, actualEvidenceSha256: evidence.sha256, changesMade: true, productionGo: true }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ checkedAt: new Date().toISOString(), status: 'FAIL_P6_TO_P7_PHASE_PROMOTION', failure: String(error?.message || 'promotion failure').slice(0, 240), changesMade: false, productionGo: false }, null, 2));
  process.exitCode = 1;
}
