export function evaluateProductionLogGate(observation) {
  const failures = [];
  if (observation.http5xxCount > 0) failures.push(`HTTP_5XX_COUNT_${observation.http5xxCount}`);
  if (observation.currentReadinessStatus !== 200) failures.push('CURRENT_READINESS_NOT_200');
  if (observation.fatalEventCount > 0) failures.push(`FATAL_EVENT_COUNT_${observation.fatalEventCount}`);
  if (observation.errorLevelCount > 0) failures.push(`ERROR_LEVEL_COUNT_${observation.errorLevelCount}`);
  if (observation.outboxRetryCount > 0) failures.push(`OUTBOX_RETRY_COUNT_${observation.outboxRetryCount}`);
  if (observation.outboxDeadLetterCount > 0) failures.push(`OUTBOX_DEAD_LETTER_COUNT_${observation.outboxDeadLetterCount}`);

  return {
    status: failures.length > 0
      ? 'FAIL_LOGS_5XX'
      : observation.insideWindow
        ? 'PASS_LOGS_5XX'
        : 'PASS_BASELINE_READY_FOR_POST_CUTOVER_RECHECK',
    failures,
    observationWindow: observation.insideWindow ? 'CUTOVER_WINDOW' : 'PRE_CUTOVER_BASELINE',
    requiresPostCutoverRecheck: !observation.insideWindow,
    productionGo: false
  };
}
