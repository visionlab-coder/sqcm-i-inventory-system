const driver = String(process.env.AI_PROVIDER_DRIVER || 'rules').toLowerCase();
const healthUrl = String(process.env.AI_PROVIDER_HEALTH_URL || '').trim();
const readyUrl = String(process.env.AI_PROVIDER_READY_URL || '').trim();
const recommendUrl = String(process.env.AI_PROVIDER_URL || '').trim();
const ocrUrl = String(process.env.AI_PROVIDER_OCR_URL || '').trim();
const apiKey = String(process.env.AI_PROVIDER_API_KEY || '').trim();
const timeoutMs = Math.min(10_000, Math.max(1_000, Number(process.env.AI_PROVIDER_TIMEOUT_MS || 3_000)));

if (driver === 'rules') {
  console.log(JSON.stringify({ status: 'skipped', driver: 'rules', reason: 'external AI provider is disabled' }));
  process.exit(0);
}
if (driver !== 'external') {
  console.error(JSON.stringify({ status: 'failed', code: 'INVALID_DRIVER', driver }));
  process.exit(1);
}
if (!healthUrl || !readyUrl || !recommendUrl || !ocrUrl) {
  console.error(JSON.stringify({ status: 'failed', code: 'MISSING_AI_ENDPOINT', required: ['AI_PROVIDER_URL', 'AI_PROVIDER_OCR_URL', 'AI_PROVIDER_HEALTH_URL', 'AI_PROVIDER_READY_URL'] }));
  process.exit(1);
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return 'invalid-url'; }
}

async function probe(url, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { accept: 'application/json' };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const response = await fetch(url, { headers, signal: controller.signal });
    const body = await response.text();
    if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
    return { label, host: hostOf(url), status: response.status, responseBytes: Buffer.byteLength(body) };
  } finally {
    clearTimeout(timer);
  }
}

try {
  const probes = await Promise.all([
    probe(healthUrl, 'health'),
    probe(readyUrl, 'readiness')
  ]);
  console.log(JSON.stringify({ status: 'ok', driver, endpoints: { recommend: hostOf(recommendUrl), ocr: hostOf(ocrUrl) }, probes }));
} catch (error) {
  const code = error?.name === 'AbortError' ? 'HEALTH_TIMEOUT' : 'HEALTH_UNREACHABLE';
  console.error(JSON.stringify({ status: 'failed', code, message: String(error?.message || '').slice(0, 200) }));
  process.exit(1);
}
