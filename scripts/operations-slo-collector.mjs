import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendSloSampleOnce, buildSloMeasurementExport, evaluateSloCollectionGate, parseSloLedger, SLO_COLLECTION_CONFIRMATION, writeSloMeasurementExportOnce } from '../src/operations/operations-slo-collector.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = JSON.parse(fs.readFileSync(path.join(projectRoot, 'agent docs', 'harness', 'MASTER_ROADMAP.json'), 'utf8'));
const p6 = roadmap.phases.find((phase) => phase.id === 'P6'); const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const ledgerPath = process.env.P7_SLO_LEDGER_FILE ? path.resolve(process.env.P7_SLO_LEDGER_FILE) : null;
const exportPath = process.env.P7_SLO_MEASUREMENT_INPUT_FILE ? path.resolve(process.env.P7_SLO_MEASUREMENT_INPUT_FILE) : null;
const physicalExternalTarget = (candidate) => {
  if (!candidate || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try {
    const parent = path.dirname(candidate); const stat = fs.lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)) return false;
    if (path.resolve(fs.realpathSync(parent)).toLowerCase() !== path.resolve(parent).toLowerCase()) return false;
    if (fs.existsSync(candidate)) { const fileStat = fs.lstatSync(candidate); if (!fileStat.isFile() || fileStat.isSymbolicLink() || (fileStat.isReparsePoint?.() ?? false)) return false; }
    return true;
  } catch { return false; }
};
const gate = evaluateSloCollectionGate({ p6EvidenceComplete: p6?.status === 'evidence-complete', p7InProgress: p7?.status === 'in-progress', productionGo: roadmap.invariants?.productionGo === true, ledgerConfigured: Boolean(ledgerPath), exportConfigured: Boolean(exportPath), exportExists: Boolean(exportPath && fs.existsSync(exportPath)), execute: process.argv.includes('--collect'), confirmed: process.env.P7_SLO_COLLECTION_CONFIRMATION === SLO_COLLECTION_CONFIRMATION });
let status = gate.status; let sampleCount = ledgerPath && fs.existsSync(ledgerPath) ? parseSloLedger(fs.readFileSync(ledgerPath, 'utf8')).length : 0; let sampleAppended = false; let exportCreated = false;
if (gate.shouldProbe) {
  try {
    if (!physicalExternalTarget(ledgerPath) || !physicalExternalTarget(exportPath)) throw new Error('SLO_PATHS_MUST_BE_EXTERNAL_PHYSICAL');
    const started = performance.now();
    const responses = await Promise.all(['/health', '/api/readiness'].map((route) => fetch(`https://inventory.safe-link.co.kr${route}`, { redirect: 'error', signal: AbortSignal.timeout(10000) }).catch(() => null)));
    const available = responses.every((response) => response?.status === 200 && response.url.startsWith('https://inventory.safe-link.co.kr/'));
    const sample = { schemaVersion: 1, environment: 'production', activationState: 'actual', measurementType: 'PRODUCTION_HTTPS_MONITORING_SAMPLE', targetUrl: 'https://inventory.safe-link.co.kr', timestamp: new Date().toISOString(), available, latencyMs: available ? Number((performance.now() - started).toFixed(3)) : null };
    const append = appendSloSampleOnce(ledgerPath, sample); status = append.status; sampleCount = append.sampleCount; sampleAppended = append.appended;
    if (sampleCount >= 30 && !fs.existsSync(exportPath)) { writeSloMeasurementExportOnce(exportPath, buildSloMeasurementExport(parseSloLedger(fs.readFileSync(ledgerPath, 'utf8')))); exportCreated = true; status = 'PASS_P7_SLO_30_DAY_EXPORT_CREATED'; }
  } catch { status = 'BLOCKED_P7_SLO_SAMPLE_COLLECTION'; process.exitCode = 1; }
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), status, requiredLedgerEnvironment: 'P7_SLO_LEDGER_FILE', requiredExportEnvironment: 'P7_SLO_MEASUREMENT_INPUT_FILE', confirmationEnvironment: 'P7_SLO_COLLECTION_CONFIRMATION', sampleCount, sampleAppended, exportCreated, p6EvidenceComplete: p6?.status === 'evidence-complete', p7Status: p7?.status ?? null, externalHttpReadPerformed: gate.shouldProbe, localEvidenceWritePerformed: sampleAppended || exportCreated, externalMutationPerformed: false, secretValuesReadOrRecorded: false, productionGo: roadmap.invariants?.productionGo === true }, null, 2));
