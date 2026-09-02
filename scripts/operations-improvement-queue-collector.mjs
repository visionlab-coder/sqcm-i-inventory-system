import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IMPROVEMENT_QUEUE_COLLECTION_CONFIRMATION,
  IMPROVEMENT_QUEUE_LABEL,
  IMPROVEMENT_QUEUE_REPOSITORY,
  buildImprovementQueueExport,
  evaluateImprovementQueueCollectionGate,
  readBoundedGitHubIssuePage,
  validateImprovementQueueTriageAttestation,
  writeImprovementQueueExportOnce
} from '../src/operations/operations-improvement-queue-collector.mjs';
import { compileOperationsImprovementQueueEvidence } from '../src/operations/operations-improvement-queue-evidence.mjs';
import { readOperationsActivationInputDocument, readOperationsSecretInput } from '../src/operations/operations-activation-input-reader.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = JSON.parse(fs.readFileSync(path.join(projectRoot, 'agent docs', 'harness', 'MASTER_ROADMAP.json'), 'utf8'));
const p6 = roadmap.phases.find((phase) => phase.id === 'P6');
const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const tokenPath = process.env.P7_GITHUB_API_TOKEN_FILE ? path.resolve(process.env.P7_GITHUB_API_TOKEN_FILE) : null;
const attestationPath = process.env.P7_IMPROVEMENT_QUEUE_TRIAGE_ATTESTATION_FILE ? path.resolve(process.env.P7_IMPROVEMENT_QUEUE_TRIAGE_ATTESTATION_FILE) : null;
const outputPath = process.env.P7_IMPROVEMENT_QUEUE_INPUT_FILE ? path.resolve(process.env.P7_IMPROVEMENT_QUEUE_INPUT_FILE) : null;

function externalPhysicalFile(candidate) {
  if (!candidate || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isFile() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false)
      && path.resolve(fs.realpathSync(candidate)).toLowerCase() === path.resolve(candidate).toLowerCase();
  } catch { return false; }
}

function externalNewFile(candidate) {
  if (!candidate || fs.existsSync(candidate) || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try {
    const parent = path.dirname(candidate);
    const stat = fs.lstatSync(parent);
    return stat.isDirectory() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false)
      && path.resolve(fs.realpathSync(parent)).toLowerCase() === path.resolve(parent).toLowerCase();
  } catch { return false; }
}

async function fetchAllOperationsIssues(token) {
  const issues = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = new URL(`https://api.github.com/repos/${IMPROVEMENT_QUEUE_REPOSITORY}/issues`);
    url.searchParams.set('state', 'open');
    url.searchParams.set('labels', IMPROVEMENT_QUEUE_LABEL);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'sqcm-i-operations-queue-collector'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`GITHUB_ISSUE_READ_FAILED_${response.status}`);
    const pageItems = await readBoundedGitHubIssuePage(response);
    issues.push(...pageItems.filter((item) => !item.pull_request));
    if (pageItems.length < 100) return issues;
  }
  throw new Error('GITHUB_ISSUE_QUEUE_EXCEEDS_1000');
}

const gate = evaluateImprovementQueueCollectionGate({
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7InProgress: p7?.status === 'in-progress',
  productionGo: roadmap.invariants?.productionGo === true,
  tokenReferencePresent: externalPhysicalFile(tokenPath),
  attestationPresent: externalPhysicalFile(attestationPath),
  outputConfigured: externalNewFile(outputPath),
  outputExists: Boolean(outputPath && fs.existsSync(outputPath)),
  execute: process.argv.includes('--collect'),
  confirmed: process.env.P7_IMPROVEMENT_QUEUE_COLLECTION_CONFIRMATION === IMPROVEMENT_QUEUE_COLLECTION_CONFIRMATION
});

let status = gate.status;
let issueCount = 0;
let exportCreated = false;
let githubReadPerformed = false;
let secretValueUsed = false;
let failureCount = 0;

if (gate.githubReadAllowed) {
  try {
    const checkedAt = new Date().toISOString();
    const attestationInput = readOperationsActivationInputDocument(attestationPath, { repositoryRoot: projectRoot });
    const attestation = validateImprovementQueueTriageAttestation(attestationInput.value, { checkedAt });
    const token = readOperationsSecretInput(tokenPath, { repositoryRoot: projectRoot }).value;
    secretValueUsed = true;
    if (token.length < 20 || /\s/.test(token)) throw new Error('GITHUB_TOKEN_REFERENCE_INVALID');
    githubReadPerformed = true;
    const issues = await fetchAllOperationsIssues(token);
    issueCount = issues.length;
    const exportValue = buildImprovementQueueExport({ issues, attestation, exportedAt: checkedAt });
    const contract = compileOperationsImprovementQueueEvidence(exportValue, { checkedAt, sourceSha256: '0'.repeat(64) });
    if (!contract.evidence) throw new Error(`IMPROVEMENT_QUEUE_EXPORT_CONTRACT_INVALID_${contract.failures.length}`);
    writeImprovementQueueExportOnce(outputPath, exportValue);
    exportCreated = true;
    status = 'PASS_PRODUCTION_IMPROVEMENT_QUEUE_EXPORT_CREATED';
  } catch {
    status = 'BLOCKED_PRODUCTION_IMPROVEMENT_QUEUE_COLLECTION';
    failureCount = 1;
    process.exitCode = 1;
  }
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), status,
  requiredTokenEnvironment: 'P7_GITHUB_API_TOKEN_FILE',
  requiredAttestationEnvironment: 'P7_IMPROVEMENT_QUEUE_TRIAGE_ATTESTATION_FILE',
  requiredOutputEnvironment: 'P7_IMPROVEMENT_QUEUE_INPUT_FILE',
  confirmationEnvironment: 'P7_IMPROVEMENT_QUEUE_COLLECTION_CONFIRMATION',
  repository: IMPROVEMENT_QUEUE_REPOSITORY, label: IMPROVEMENT_QUEUE_LABEL,
  missing: gate.missing, issueCount, exportCreated, failureCount,
  p6EvidenceComplete: p6?.status === 'evidence-complete', p7Status: p7?.status ?? null,
  githubReadPerformed, externalIssueCreatedOrChanged: false, localEvidenceWritePerformed: exportCreated,
  externalMutationPerformed: false, secretValueUsed, secretValuesRecorded: false,
  productionGo: roadmap.invariants?.productionGo === true
}, null, 2));
