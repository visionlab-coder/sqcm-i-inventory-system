import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPERATIONS_SIGNOFF_DOMAINS } from '../src/operations/operations-signoff-evidence.mjs';
import {
  OPERATIONS_SIGNOFF_INPUT_ASSEMBLY_CONFIRMATION,
  buildOperationsSignoffInput,
  evaluateOperationsSignoffInputAssemblyGate,
  sha256OperationsDocument,
  writeOperationsSignoffInputOnce
} from '../src/operations/operations-signoff-input-assembler.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = JSON.parse(fs.readFileSync(path.join(projectRoot, 'agent docs', 'harness', 'MASTER_ROADMAP.json'), 'utf8'));
const p6 = roadmap.phases.find((phase) => phase.id === 'P6');
const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const p6Path = process.env.P7_P6_CUTOVER_EVIDENCE_FILE ? path.resolve(process.env.P7_P6_CUTOVER_EVIDENCE_FILE) : null;
const approvalPath = process.env.P7_OPERATIONS_OWNER_APPROVAL_RECEIPT_FILE ? path.resolve(process.env.P7_OPERATIONS_OWNER_APPROVAL_RECEIPT_FILE) : null;
const outputPath = process.env.P7_OPERATIONS_SIGNOFF_INPUT_FILE ? path.resolve(process.env.P7_OPERATIONS_SIGNOFF_INPUT_FILE) : null;
const domainEnvironment = {
  slo: 'P7_SLO_EVIDENCE_FILE', alerting: 'P7_ALERTING_EVIDENCE_FILE', backup: 'P7_BACKUP_EVIDENCE_FILE',
  restore: 'P7_RESTORE_EVIDENCE_FILE', certificate: 'P7_CERTIFICATE_EVIDENCE_FILE', onCall: 'P7_ONCALL_EVIDENCE_FILE',
  maintenance: 'P7_MAINTENANCE_EVIDENCE_FILE', improvementQueue: 'P7_IMPROVEMENT_QUEUE_EVIDENCE_FILE'
};
const domainPaths = Object.fromEntries(Object.entries(domainEnvironment).map(([domain, name]) => [domain, process.env[name] ? path.resolve(process.env[name]) : null]));

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

const gate = evaluateOperationsSignoffInputAssemblyGate({
  p6EvidenceComplete: p6?.status === 'evidence-complete', p7InProgress: p7?.status === 'in-progress',
  productionGo: roadmap.invariants?.productionGo === true,
  p6EvidencePresent: externalPhysicalFile(p6Path),
  domainEvidencePresent: Object.fromEntries(OPERATIONS_SIGNOFF_DOMAINS.map((domain) => [domain, externalPhysicalFile(domainPaths[domain])])),
  approvalReceiptPresent: externalPhysicalFile(approvalPath), outputConfigured: externalNewFile(outputPath),
  outputExists: externalPhysicalFile(outputPath), execute: process.argv.includes('--assemble'),
  confirmed: process.env.P7_OPERATIONS_SIGNOFF_INPUT_ASSEMBLY_CONFIRMATION === OPERATIONS_SIGNOFF_INPUT_ASSEMBLY_CONFIRMATION
});

let status = gate.status;
let inputDocumentReadCount = 0;
let outputCreated = false;
let failureCount = 0;

if (gate.inputReadAllowed) {
  try {
    const p6Raw = fs.readFileSync(p6Path); inputDocumentReadCount += 1;
    const p6Document = JSON.parse(p6Raw.toString('utf8'));
    const domainDocuments = {}; const domainHashes = {};
    for (const domain of OPERATIONS_SIGNOFF_DOMAINS) {
      const raw = fs.readFileSync(domainPaths[domain]); inputDocumentReadCount += 1;
      domainDocuments[domain] = JSON.parse(raw.toString('utf8'));
      domainHashes[domain] = sha256OperationsDocument(raw);
    }
    const approvalReceipt = JSON.parse(fs.readFileSync(approvalPath, 'utf8')); inputDocumentReadCount += 1;
    const checkedAt = new Date().toISOString();
    const value = buildOperationsSignoffInput({
      p6Document, domainDocuments, approvalReceipt,
      hashes: { p6Cutover: sha256OperationsDocument(p6Raw), domains: domainHashes }, checkedAt
    });
    writeOperationsSignoffInputOnce(outputPath, value);
    outputCreated = true;
    status = 'PASS_PRODUCTION_OPERATIONS_SIGNOFF_INPUT_ASSEMBLED';
  } catch {
    status = 'BLOCKED_PRODUCTION_OPERATIONS_SIGNOFF_INPUT_ASSEMBLY';
    failureCount = 1;
    process.exitCode = 1;
  }
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), status,
  requiredP6Environment: 'P7_P6_CUTOVER_EVIDENCE_FILE', requiredDomainEnvironment: domainEnvironment,
  requiredApprovalEnvironment: 'P7_OPERATIONS_OWNER_APPROVAL_RECEIPT_FILE',
  requiredOutputEnvironment: 'P7_OPERATIONS_SIGNOFF_INPUT_FILE',
  confirmationEnvironment: 'P7_OPERATIONS_SIGNOFF_INPUT_ASSEMBLY_CONFIRMATION',
  missing: gate.missing, inputDocumentReadCount, outputCreated, failureCount,
  p6EvidenceComplete: p6?.status === 'evidence-complete', p7Status: p7?.status ?? null,
  externalSignatureCreatedOrChanged: false, externalMutationPerformed: false,
  localEvidenceWritePerformed: outputCreated, secretValuesReadOrRecorded: false,
  productionGo: roadmap.invariants?.productionGo === true
}, null, 2));
