const DEFAULT_TIMEOUT_MS = 12_000;

function jsonContent(value) {
  if (value && typeof value === 'object') return value;
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI provider returned no JSON object.');
  return JSON.parse(text.slice(start, end + 1));
}

function jsonObject(value, label) {
  const parsed = jsonContent(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`AI provider ${label} response must be a JSON object.`);
  return parsed;
}

function createHttpAiProvider(config, fetchImpl = fetch) {
  const baseUrl = String(config.aiProviderUrl || '').trim();
  if (!baseUrl) throw new Error('AI_PROVIDER_URL is required for the built-in external AI adapter.');
  const apiKey = String(config.aiProviderApiKey || '').trim();
  const model = String(config.aiProviderModel || 'cost-control-v1').trim();
  const timeoutMs = Number(config.aiProviderTimeoutMs || DEFAULT_TIMEOUT_MS);
  const providerName = String(config.aiProviderName || 'external-http').trim();

  async function request(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    try {
      const response = await fetchImpl(url, { ...options, headers, signal: controller.signal });
      const text = await response.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 1000) }; }
      if (!response.ok) throw new Error(`AI provider HTTP ${response.status}.`);
      return body;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('AI provider request timed out.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function recommend({ organizationId, query = {}, assets = [] }) {
    const response = await request(baseUrl, {
      method: 'POST',
      body: JSON.stringify({ organizationId, query, assets })
    });
    const result = jsonObject(response, 'recommend');
    if (!Array.isArray(result.recommendations)) throw new Error('AI provider recommend response must contain recommendations[].');
    return {
      provider: typeof result.provider === 'string' && result.provider.trim() ? result.provider.trim() : providerName,
      modelVersion: typeof result.modelVersion === 'string' && result.modelVersion.trim() ? result.modelVersion.trim() : model,
      recommendations: result.recommendations,
      usage: result.usage && typeof result.usage === 'object' ? result.usage : null
    };
  }

  async function extract({ organizationId, assetId = null, fileId = null, text = '' }) {
    const ocrUrl = String(config.aiProviderOcrUrl || '').trim();
    if (!ocrUrl) throw new Error('AI_PROVIDER_OCR_URL is required for the external OCR adapter.');
    const response = await request(ocrUrl, { method: 'POST', body: JSON.stringify({ organizationId, assetId, fileId, text }) });
    const result = jsonObject(response, 'ocr');
    if (!result.fields || typeof result.fields !== 'object' || Array.isArray(result.fields)) throw new Error('AI provider OCR response must contain fields.');
    if (!result.confidence || typeof result.confidence !== 'object' || Array.isArray(result.confidence)) throw new Error('AI provider OCR response must contain confidence.');
    return { fields: result.fields, confidence: result.confidence, usage: result.usage && typeof result.usage === 'object' ? result.usage : null };
  }

  async function healthCheck() {
    const healthUrl = String(config.aiProviderHealthUrl || '').trim();
    if (!healthUrl) throw new Error('AI_PROVIDER_HEALTH_URL is required for the external AI adapter.');
    await request(healthUrl, { method: 'GET' });
    return { status: 'ok', provider: providerName, modelVersion: model };
  }

  async function readinessCheck() {
    const readyUrl = String(config.aiProviderReadyUrl || '').trim();
    if (!readyUrl) throw new Error('AI_PROVIDER_READY_URL is required for the external AI adapter.');
    await request(readyUrl, { method: 'GET' });
    return { status: 'ready', provider: providerName, modelVersion: model };
  }

  return { driver: 'HTTP', name: providerName, modelVersion: model, recommend, healthCheck, readinessCheck, ocr: { extract } };
}

module.exports = { createHttpAiProvider, jsonContent };
