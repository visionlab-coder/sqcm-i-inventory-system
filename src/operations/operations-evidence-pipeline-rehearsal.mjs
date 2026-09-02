import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { compileOperationsSloEvidence } from './operations-slo-evidence.mjs';
import { compileOperationsAlertingEvidence } from './operations-alerting-evidence.mjs';
import { compileOperationsBackupRestoreEvidence } from './operations-backup-restore-evidence.mjs';
import { compileOperationsCertificateEvidence } from './operations-certificate-evidence.mjs';
import { compileOperationsOnCallEvidence } from './operations-oncall-evidence.mjs';
import { compileOperationsMaintenanceEvidence } from './operations-maintenance-evidence.mjs';
import { compileOperationsImprovementQueueEvidence } from './operations-improvement-queue-evidence.mjs';
import { compileOperationsSignoffEvidence } from './operations-signoff-evidence.mjs';
import { buildOperationsHandoverManifest } from './operations-handover-assembler.mjs';
import { loadActualOperationsHandoverBundle, validateActualOperationsHandoverEvidence } from './operations-handover-finalizer.mjs';

const TARGET_URL = 'https://inventory.safe-link.co.kr';
const CHECKED_AT = '2026-10-12T01:00:00.000Z';
const RELEASE_SHA = 'b'.repeat(40);
const DOMAINS = ['slo', 'alerting', 'backup', 'restore', 'certificate', 'onCall', 'maintenance', 'improvementQueue'];
const DUTIES = ['on_call', 'alert_response', 'backup_restore', 'certificate_renewal', 'daily_maintenance', 'improvement_triage'];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function compileOrThrow(label, compilation) {
  if (!compilation?.evidence) throw new Error(`${label}_COMPILATION_FAILED:${compilation?.failures?.join('|') ?? 'unknown'}`);
  return compilation.evidence;
}

function writeEvidence(tempDir, name, evidence) {
  const filePath = path.join(tempDir, `${name}.json`);
  const raw = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
  fs.writeFileSync(filePath, raw, { flag: 'wx' });
  return { path: `${name}.json`, sha256: sha256(raw) };
}

function syntheticSources(targetUrl = TARGET_URL) {
  const measurementStart = Date.parse('2026-09-12T00:00:00.000Z');
  const checks = ['frontend_health', 'api_health', 'database_health', 'http_5xx', 'login_failure_spike', 'backup_success'];
  return {
    slo: {
      schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
      measurementType: 'PRODUCTION_HTTPS_MONITORING_EXPORT', targetUrl,
      measurementStart: '2026-09-12T00:00:00.000Z', measurementEnd: '2026-10-12T00:00:00.000Z',
      samples: Array.from({ length: 30 }, (_, index) => ({
        timestamp: new Date(measurementStart + index * 24 * 60 * 60 * 1000).toISOString(), available: true, latencyMs: 100 + index
      }))
    },
    alerting: {
      schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
      receiptType: 'PRODUCTION_ALERT_RECEIPT_EXPORT', targetUrl,
      providerRef: 'provider://approved-alerting', channelRef: 'channel://operations-primary',
      recipientRef: 'identity://operations-recipient', ownerRef: 'identity://operations-owner',
      signals: ['availability', 'latency_p95', 'http_5xx', 'backup_failure', 'certificate_expiry'].map((id, index) => ({
        id, received: true, receiptId: `rehearsal-receipt-${id}`,
        triggeredAt: `2026-10-12T00:0${index}:00.000Z`, receivedAt: `2026-10-12T00:0${index}:30.000Z`
      }))
    },
    backupRestore: {
      schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
      evidenceType: 'PRODUCTION_BACKUP_RESTORE_DRILL_EXPORT', targetUrl, ownerRef: 'identity://operations-owner',
      backup: {
        backupId: 'rehearsal-backup-prod-20261012', createdAt: '2026-10-12T00:00:00.000Z',
        offsiteStoredAt: '2026-10-12T00:10:00.000Z', checksumVerified: true, artifactSha256: 'b'.repeat(64),
        sourceDatabaseRef: 'database://production-primary', offsiteStorageRef: 'storage://approved-offsite-backup',
        retentionUntil: '2026-11-12T00:00:00.000Z'
      },
      restore: {
        drillId: 'rehearsal-restore-20261012', backupId: 'rehearsal-backup-prod-20261012',
        startedAt: '2026-10-12T00:20:00.000Z', completedAt: '2026-10-12T00:50:00.000Z',
        isolatedTarget: true, rowCountsMatch: true, schemaMigrationsMatch: true,
        targetDatabaseRef: 'database://isolated-restore-drill', sourceCountsSha256: 'c'.repeat(64), restoredCountsSha256: 'c'.repeat(64)
      }
    },
    certificate: {
      schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
      evidenceType: 'PRODUCTION_TLS_CERTIFICATE_OBSERVATION', targetUrl,
      hostname: 'inventory.safe-link.co.kr', renewalOwnerRef: 'identity://operations-owner',
      certificateProviderRef: 'provider://cloudflare-managed-tls',
      observation: {
        observedAt: '2026-10-12T00:30:00.000Z', tlsValid: true, hostnameVerified: true, chainVerified: true,
        protocol: 'TLSv1.3', serialNumber: '01:23:45:67:89:AB:CD:EF', fingerprintSha256: 'd'.repeat(64),
        validFrom: '2026-09-01T00:00:00.000Z', validTo: '2026-12-31T00:00:00.000Z', healthStatus: 200, readinessStatus: 200
      }
    },
    onCall: {
      schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
      evidenceType: 'PRODUCTION_ONCALL_HANDOVER_EXPORT', targetUrl,
      schedule: {
        scheduleRef: 'schedule://sqcm-i-production-primary', timezone: 'Asia/Seoul', continuousCoverage: true,
        effectiveFrom: '2026-09-11T11:00:00.000Z', effectiveUntil: '2026-11-30T15:00:00.000Z',
        primaryOwnerRef: 'identity://operations-primary', escalationOwnerRef: 'identity://operations-escalation',
        primaryAcceptedAt: '2026-09-11T11:01:00.000Z', escalationAcceptedAt: '2026-09-11T11:02:00.000Z'
      },
      drill: {
        drillId: 'rehearsal-oncall-20261012', channelRef: 'channel://operations-primary',
        primaryOwnerRef: 'identity://operations-primary', escalationOwnerRef: 'identity://operations-escalation',
        initiatedAt: '2026-10-12T00:00:00.000Z', primaryAcknowledgedAt: '2026-10-12T00:04:00.000Z',
        primaryReceiptId: 'rehearsal-primary-20261012', escalationTriggeredAt: '2026-10-12T00:05:00.000Z',
        escalationAcknowledgedAt: '2026-10-12T00:15:00.000Z', escalationReceiptId: 'rehearsal-escalation-20261012'
      }
    },
    maintenance: {
      schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
      evidenceType: 'PRODUCTION_MAINTENANCE_EXECUTION_EXPORT', targetUrl, releaseSha: RELEASE_SHA,
      execution: {
        executionId: 'rehearsal-maintenance-20261012', scheduleRef: 'maintenance://sqcm-i-production-daily',
        contractRef: 'docs/maintenance.md', operatorRef: 'identity://operations-maintainer',
        startedAt: '2026-10-12T00:00:00.000Z', completedAt: '2026-10-12T00:30:00.000Z',
        nextScheduledAt: '2026-10-13T00:00:00.000Z', blockingFindingCount: 0,
        checks: checks.map((id, index) => ({ id, status: 'PASS', observedAt: `2026-10-12T00:${String(index + 1).padStart(2, '0')}:00.000Z`, receiptId: `rehearsal-${id}-20261012` }))
      }
    },
    improvementQueue: {
      schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
      evidenceType: 'PRODUCTION_IMPROVEMENT_QUEUE_EXPORT', targetUrl,
      queue: {
        provider: 'GITHUB_ISSUES', repository: 'visionlab-coder/sqcm-i-inventory-system',
        queueRef: 'github://visionlab-coder/sqcm-i-inventory-system/issues?label=operations',
        triageOwnerRef: 'identity://operations-triage-owner', triageReceiptId: 'rehearsal-triage-20261012',
        exportedAt: '2026-10-12T00:30:00.000Z', lastTriagedAt: '2026-10-12T00:00:00.000Z',
        nextTriageAt: '2026-10-19T00:00:00.000Z', untrackedFindingCount: 0, openItemCount: 1,
        items: [{
          issueRef: 'github://visionlab-coder/sqcm-i-inventory-system/issues/999999', source: 'user_feedback',
          severity: 'P3', status: 'TODO', ownerRef: 'identity://product-owner', acceptanceRef: 'acceptance://rehearsal-999999',
          createdAt: '2026-10-11T00:00:00.000Z', triagedAt: '2026-10-12T00:00:00.000Z', nextActionAt: '2026-10-20T00:00:00.000Z'
        }]
      }
    }
  };
}

export function runOperationsEvidencePipelineRehearsal({
  tamperDomain = null, tempRoot = os.tmpdir(), releaseSha = RELEASE_SHA, targetUrl = TARGET_URL
} = {}) {
  if (!/^[a-f0-9]{40}$/.test(releaseSha ?? '')) throw new Error('RELEASE_SHA_INVALID');
  if (targetUrl !== TARGET_URL) throw new Error('TARGET_URL_INVALID');
  const tempDir = fs.mkdtempSync(path.join(tempRoot, 'sqcmi-p7-pipeline-rehearsal-'));
  try {
    const sources = syntheticSources(targetUrl);
    sources.maintenance.releaseSha = releaseSha;
    const evidence = {};
    evidence.slo = compileOrThrow('SLO', compileOperationsSloEvidence(sources.slo, { checkedAt: CHECKED_AT, sourceSha256: '1'.repeat(64) }));
    evidence.alerting = compileOrThrow('ALERTING', compileOperationsAlertingEvidence(sources.alerting, { checkedAt: CHECKED_AT, sourceSha256: '2'.repeat(64) }));
    const backupRestore = compileOperationsBackupRestoreEvidence(sources.backupRestore, { checkedAt: CHECKED_AT, sourceSha256: '3'.repeat(64) });
    if (!backupRestore?.evidence) throw new Error(`BACKUP_RESTORE_COMPILATION_FAILED:${backupRestore?.failures?.join('|') ?? 'unknown'}`);
    evidence.backup = backupRestore.evidence.backup;
    evidence.restore = backupRestore.evidence.restore;
    evidence.certificate = compileOrThrow('CERTIFICATE', compileOperationsCertificateEvidence(sources.certificate, { checkedAt: CHECKED_AT, sourceSha256: '4'.repeat(64) }));
    evidence.onCall = compileOrThrow('ONCALL', compileOperationsOnCallEvidence(sources.onCall, { checkedAt: CHECKED_AT, sourceSha256: '5'.repeat(64) }));
    evidence.maintenance = compileOrThrow('MAINTENANCE', compileOperationsMaintenanceEvidence(sources.maintenance, { checkedAt: CHECKED_AT, sourceSha256: '6'.repeat(64) }));
    evidence.improvementQueue = compileOrThrow('IMPROVEMENT_QUEUE', compileOperationsImprovementQueueEvidence(sources.improvementQueue, { checkedAt: CHECKED_AT, sourceSha256: '7'.repeat(64) }));

    const p6Evidence = {
      schemaVersion: 1, environment: 'production', activationState: 'actual', evidenceType: 'P6_CUTOVER_ACTUAL',
      domain: 'p6-cutover', status: 'PASS', checkedAt: '2026-10-12T00:45:00.000Z', productionGo: true,
      targetUrl, releaseSha
    };
    const references = { p6Gate: writeEvidence(tempDir, 'p6Gate', p6Evidence) };
    for (const name of DOMAINS) references[name] = writeEvidence(tempDir, name, evidence[name]);

    const signoffSource = {
      schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
      evidenceType: 'PRODUCTION_OPERATIONS_SIGNOFF_EXPORT', targetUrl, releaseSha,
      p6CutoverEvidenceSha256: references.p6Gate.sha256,
      signoff: {
        decision: 'APPROVED', role: 'OPERATIONS_OWNER', signedByRef: 'identity://operations-owner',
        signedAt: '2026-10-12T00:55:00.000Z', receiptId: 'rehearsal-operations-signoff-20261012', blockingExceptionCount: 0,
        attestations: DOMAINS.map((domain) => ({ domain, status: 'PASS', evidenceSha256: references[domain].sha256 })),
        acceptedDuties: DUTIES
      }
    };
    evidence.operationsSignoff = compileOrThrow('OPERATIONS_SIGNOFF', compileOperationsSignoffEvidence(signoffSource, { checkedAt: CHECKED_AT, sourceSha256: '8'.repeat(64) }));
    references.operationsSignoff = writeEvidence(tempDir, 'operationsSignoff', evidence.operationsSignoff);

    const manifest = buildOperationsHandoverManifest({ references, documents: { operationsSignoff: { value: evidence.operationsSignoff } } });
    const manifestPath = path.join(tempDir, 'manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    if (tamperDomain) fs.appendFileSync(path.join(tempDir, `${tamperDomain}.json`), '\n');
    const documents = loadActualOperationsHandoverBundle(manifest, { baseDir: tempDir });
    const validation = validateActualOperationsHandoverEvidence(manifest, { documents });
    return {
      status: validation.p7CompletionReady ? 'PASS_SYNTHETIC_OPERATIONS_EVIDENCE_PIPELINE_REHEARSAL' : 'BLOCKED_SYNTHETIC_OPERATIONS_EVIDENCE_PIPELINE_REHEARSAL',
      failures: validation.failures,
      compilerCount: 8,
      domainCount: DOMAINS.length,
      verifiedDocumentCount: validation.verifiedDocumentCount,
      manifestSchemaVersion: manifest.schemaVersion,
      releaseSha, targetUrl,
      syntheticOnly: true,
      actualEvidenceCreated: false,
      externalMutationPerformed: false,
      productionGo: false
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
