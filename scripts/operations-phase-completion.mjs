import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadActualOperationsHandoverBundle, readActualOperationsHandoverEvidenceFile, validateActualOperationsHandoverEvidence } from '../src/operations/operations-handover-finalizer.mjs';
import { P7_COMPLETION_CONFIRMATION, completeCurrentStateDocument, completeRoadmapDocument, evaluateP7Completion } from '../src/operations/operations-phase-completion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = { roadmap: path.join(root, 'agent docs', 'harness', 'MASTER_ROADMAP.json'), queue: path.join(root, 'agent docs', 'harness', 'P6_P7_ACCELERATION_QUEUE.json'), current: path.join(root, 'docs', 'current-state.md'), roadmapDoc: path.join(root, 'docs', 'roadmap.md') };
const input = process.env.OPERATIONS_HANDOVER_ACTUAL_EVIDENCE_FILE;
if (!input) {
  console.log(JSON.stringify({ status: 'READY_WAIT_ACTUAL_HANDOVER_EVIDENCE_FOR_8_OF_8', requiredEnvironment: 'OPERATIONS_HANDOVER_ACTUAL_EVIDENCE_FILE', changesMade: false }, null, 2));
  process.exit(0);
}
try {
  const loaded = readActualOperationsHandoverEvidenceFile(input, { repositoryRoot: root });
  const actualEvidence = loaded.value;
  const validation = validateActualOperationsHandoverEvidence(actualEvidence, { documents: loadActualOperationsHandoverBundle(actualEvidence, { baseDir: path.dirname(loaded.path), repositoryRoot: root }) });
  const roadmap = JSON.parse(fs.readFileSync(files.roadmap, 'utf8'));
  const queue = JSON.parse(fs.readFileSync(files.queue, 'utf8'));
  const result = evaluateP7Completion({ roadmap, queue, actualEvidence, actualEvidenceSha256: loaded.sha256, validation, execute: process.argv.includes('--complete'), confirmation: process.env.P7_COMPLETION_CONFIRMATION });
  if (result.status !== 'READY_APPLY_P7_COMPLETION') {
    console.log(JSON.stringify({ ...result, expectedConfirmation: P7_COMPLETION_CONFIRMATION }, null, 2));
    if (result.status.startsWith('FAIL_')) process.exitCode = 1;
  } else {
    const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', shell: false });
    if (dirty.status !== 0 || dirty.stdout.trim()) throw new Error('COMPLETION_REQUIRES_CLEAN_WORKTREE');
    const next = new Map([[files.roadmap, `${JSON.stringify(result.nextRoadmap, null, 2)}\n`], [files.queue, `${JSON.stringify(result.nextQueue, null, 2)}\n`], [files.current, completeCurrentStateDocument(fs.readFileSync(files.current, 'utf8'))], [files.roadmapDoc, completeRoadmapDocument(fs.readFileSync(files.roadmapDoc, 'utf8'))]]);
    const originals = new Map([...next.keys()].map((file) => [file, fs.readFileSync(file)]));
    try { for (const [file, content] of next) fs.writeFileSync(file, content, 'utf8'); }
    catch (error) { for (const [file, content] of originals) fs.writeFileSync(file, content); throw error; }
    console.log(JSON.stringify({ status: 'PASS_ALL_PHASES_COMPLETE_8_OF_8', modifiedFileCount: 4, changesMade: true, productionGo: true }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL_P7_TERMINAL_COMPLETION', failure: String(error.message).slice(0, 240), changesMade: false }, null, 2));
  process.exitCode = 1;
}
