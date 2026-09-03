import fs from 'node:fs';
import path from 'node:path';
import { writeCreateOnlyJsonOutput } from './operations-create-only-json-output.mjs';
import { HANDOVER_DOMAINS } from './operations-handover-preflight.mjs';

export const HANDOVER_ASSEMBLY_CONFIRMATION = 'ACK-ASSEMBLE-P7-OPERATIONS-HANDOVER';
export const HANDOVER_EVIDENCE_ENVIRONMENT = {
  p6Gate: 'P7_P6_CUTOVER_EVIDENCE_FILE',
  slo: 'P7_SLO_EVIDENCE_FILE',
  alerting: 'P7_ALERTING_EVIDENCE_FILE',
  backup: 'P7_BACKUP_EVIDENCE_FILE',
  restore: 'P7_RESTORE_EVIDENCE_FILE',
  certificate: 'P7_CERTIFICATE_EVIDENCE_FILE',
  onCall: 'P7_ONCALL_EVIDENCE_FILE',
  maintenance: 'P7_MAINTENANCE_EVIDENCE_FILE',
  improvementQueue: 'P7_IMPROVEMENT_QUEUE_EVIDENCE_FILE',
  operationsSignoff: 'P7_OPERATIONS_SIGNOFF_EVIDENCE_FILE'
};

export function evaluateOperationsHandoverAssembler({
  p6EvidenceComplete = false,
  p7InProgress = false,
  referencePresence = {},
  outputReferencePresent = false,
  execute = false,
  confirmed = false
} = {}) {
  const missing = Object.keys(HANDOVER_EVIDENCE_ENVIRONMENT).filter((name) => referencePresence[name] !== true);
  if (!outputReferencePresent) missing.push('output');
  if (!p6EvidenceComplete) return { status: 'READY_WAIT_P6_COMPLETION_AND_HANDOVER_FILES', missing, manifestCreated: false };
  if (!p7InProgress) return { status: 'READY_WAIT_P7_ACTIVATION', missing, manifestCreated: false };
  if (missing.length > 0) return { status: 'READY_WAIT_HANDOVER_EVIDENCE_FILES', missing, manifestCreated: false };
  if (!execute) return { status: 'PASS_HANDOVER_ASSEMBLER_DRY_RUN_READY', missing, manifestCreated: false };
  if (!confirmed) return { status: 'READY_WAIT_HANDOVER_ASSEMBLY_CONFIRMATION', missing, manifestCreated: false };
  return { status: 'READY_HANDOVER_MANIFEST_ASSEMBLY', missing, manifestCreated: false };
}

export function buildOperationsHandoverManifest({ references, documents }) {
  const domains = {};
  for (const name of HANDOVER_DOMAINS) domains[name] = { status: 'PASS', evidenceRef: references[name] };
  const signoff = documents.operationsSignoff?.value ?? {};
  return {
    schemaVersion: 2,
    template: false,
    environment: 'production',
    activationState: 'actual',
    p6Gate: { status: 'PASS', evidenceRef: references.p6Gate },
    domains,
    operationsSignoff: {
      status: 'APPROVED',
      evidenceRef: references.operationsSignoff,
      signedByRef: signoff.signedByRef,
      signedAt: signoff.signedAt
    }
  };
}

export function writeOperationsHandoverManifestOnce(outputPath, manifest, { processId = process.pid } = {}) {
  return writeCreateOnlyJsonOutput(outputPath, manifest, { processId });
}
