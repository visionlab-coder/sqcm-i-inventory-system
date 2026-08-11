const driver = String(process.env.AI_PROVIDER_DRIVER || 'rules').toLowerCase();
const healthUrl = String(process.env.AI_PROVIDER_HEALTH_URL || '').trim();
const timeoutMs = Math.min(10_000, Math.max(1_000, Number(process.env.AI_PROVIDER_TIMEOUT_MS || 3_000)));

if (driver === 'rules') {
  console.log(JSON.stringify({ status: 'skipped', driver: 'rules', reason: 'external AI provider is disabled' }));
  process.exit(0);
}
if (driver !== 'external') {
  console.error(JSON.stringify({ status: 'failed', code: 'INVALID_DRIVER', driver }));
  process.exit(1);
}
if (!healthUrl) {
  console.error(JSON.stringify({ status: 'failed', code: 'MISSING_HEALTH_URL' }));
  process.exit(1);
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
  const response = await fetch(healthUrl, { headers: { accept: 'application/json' }, signal: controller.signal });
  const body = await response.text();
  const host = (() => { try { return new URL(healthUrl).host; } catch { return 'invalid-url'; } })();
  if (!response.ok) {
    console.error(JSON.stringify({ status: 'failed', code: 'HEALTH_HTTP_ERROR', host, httpStatus: response.status }));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: 'ok', driver, host, responseBytes: Buffer.byteLength(body) }));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', code: error?.name === 'AbortError' ? 'HEALTH_TIMEOUT' : 'HEALTH_UNREACHABLE' }));
  process.exit(1);
} finally {
  clearTimeout(timer);
}
