function nonNegative(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function evaluateOperationalSnapshot(snapshot, thresholds = {}) {
  const limits = {
    maxPendingOutboxOld: nonNegative(thresholds.maxPendingOutboxOld, 0),
    maxExpiredSessions: nonNegative(thresholds.maxExpiredSessions, 0),
    maxStuckIdempotency: nonNegative(thresholds.maxStuckIdempotency, 0),
    maxRecent5xx: nonNegative(thresholds.maxRecent5xx, 0),
    maxBackupAgeMinutes: nonNegative(thresholds.maxBackupAgeMinutes, 1440),
    maxRestoreDrillAgeMinutes: nonNegative(thresholds.maxRestoreDrillAgeMinutes, 43200)
  };
  const failures = [];
  if (snapshot.frontendStatus !== 200) failures.push(`frontend health ${snapshot.frontendStatus}`);
  if (snapshot.backendStatus !== 200) failures.push(`backend health ${snapshot.backendStatus}`);
  if (snapshot.readinessStatus !== 200) failures.push(`readiness ${snapshot.readinessStatus}`);
  if (nonNegative(snapshot.pendingOutboxOld) > limits.maxPendingOutboxOld) failures.push(`old pending outbox ${snapshot.pendingOutboxOld}/${limits.maxPendingOutboxOld}`);
  if (nonNegative(snapshot.expiredSessions) > limits.maxExpiredSessions) failures.push(`expired sessions ${snapshot.expiredSessions}/${limits.maxExpiredSessions}`);
  if (nonNegative(snapshot.stuckIdempotency) > limits.maxStuckIdempotency) failures.push(`stuck idempotency ${snapshot.stuckIdempotency}/${limits.maxStuckIdempotency}`);
  if (nonNegative(snapshot.recent5xx) > limits.maxRecent5xx) failures.push(`recent 5xx ${snapshot.recent5xx}/${limits.maxRecent5xx}`);
  if (!snapshot.backupVerified) failures.push('backup checksum is not verified');
  if (nonNegative(snapshot.backupAgeMinutes, Infinity) > limits.maxBackupAgeMinutes) failures.push(`backup age ${snapshot.backupAgeMinutes}/${limits.maxBackupAgeMinutes} minutes`);
  if (!snapshot.restoreVerified) failures.push('restore drill is not verified');
  if (nonNegative(snapshot.restoreDrillAgeMinutes, Infinity) > limits.maxRestoreDrillAgeMinutes) failures.push(`restore drill age ${snapshot.restoreDrillAgeMinutes}/${limits.maxRestoreDrillAgeMinutes} minutes`);
  return { ok: failures.length === 0, failures, limits };
}

module.exports = { evaluateOperationalSnapshot, nonNegative };
