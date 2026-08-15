const { runAutomationOnce } = require('./worker');

function createAutomationScheduler({
  pool,
  intervalMs,
  runOnce = runAutomationOnce,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  logger = console
}) {
  let running = false;
  const tick = async () => {
    if (running) return { skipped: true, reason: 'already-running' };
    running = true;
    try {
      const result = await runOnce(pool);
      logger.log(JSON.stringify({ event: 'automation_worker_run', ...result }));
      return result;
    } catch (error) {
      logger.error(JSON.stringify({ event: 'automation_worker_error', message: error.message }));
      return { skipped: false, error: error.message };
    } finally {
      running = false;
    }
  };
  const timer = setIntervalFn(tick, intervalMs);
  timer?.unref?.();
  return { tick, stop: () => clearIntervalFn(timer) };
}

module.exports = { createAutomationScheduler };
