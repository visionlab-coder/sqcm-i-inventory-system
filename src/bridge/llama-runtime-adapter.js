function jsonObject(value, label) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  if (start < 0) throw new Error(`Runtime ${label} response contains no JSON object.`);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let end = -1;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) { end = index; break; }
  }
  if (end < 0) throw new Error(`Runtime ${label} response contains no complete JSON object.`);
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Runtime ${label} response must be a JSON object.`);
  return parsed;
}

function loopbackUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Runtime URL must use HTTP loopback.');
  return url.toString().replace(/\/$/, '');
}

const OCR_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    fields: {
      type: 'object',
      additionalProperties: { type: 'string' }
    },
    confidence: {
      type: 'object',
      additionalProperties: { type: 'number', minimum: 0, maximum: 1 }
    }
  },
  required: ['fields', 'confidence'],
  additionalProperties: false
});

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateOcrResult(value) {
  if (!plainObject(value) || Object.keys(value).some(key => !['fields', 'confidence'].includes(key))) {
    throw new Error('Runtime OCR response violates structured schema.');
  }
  if (!plainObject(value.fields) || !plainObject(value.confidence)) {
    throw new Error('Runtime OCR response violates structured schema.');
  }
  const fieldKeys = Object.keys(value.fields).sort();
  const confidenceKeys = Object.keys(value.confidence).sort();
  if (fieldKeys.length === 0 || fieldKeys.join('\u0000') !== confidenceKeys.join('\u0000')) {
    throw new Error('Runtime OCR response violates structured schema.');
  }
  if (Object.values(value.fields).some(field => typeof field !== 'string')) {
    throw new Error('Runtime OCR response violates structured schema.');
  }
  if (Object.values(value.confidence).some(score => typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1)) {
    throw new Error('Runtime OCR response violates structured schema.');
  }
  return value;
}

function createLlamaRuntimeAdapter(config = {}, fetchImpl = fetch) {
  const baseUrl = loopbackUrl(config.runtimeUrl || 'http://127.0.0.1:18767');
  const apiKey = String(config.apiKey || '').trim();
  if (!apiKey) throw new Error('Runtime API key is required.');
  const timeoutMs = Number(config.timeoutMs || 60_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300_000) throw new Error('Runtime timeout must be 1000~300000ms.');

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...options,
        headers: { accept: 'application/json', authorization: `Bearer ${apiKey}`, ...(options.body ? { 'content-type': 'application/json' } : {}) },
        signal: controller.signal
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`Runtime HTTP ${response.status}.`);
      return body;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Runtime request timed out.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function chat(system, payload, responseFormat = { type: 'json_object' }) {
    const response = await request('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(payload) }],
        temperature: 0,
        max_tokens: 1200,
        response_format: responseFormat
      })
    });
    const content = response?.choices?.[0]?.message?.content;
    return { value: jsonObject(content, 'chat'), usage: response?.usage && typeof response.usage === 'object' ? response.usage : null };
  }

  async function ready(identity) {
    const health = await request('/health');
    return { ready: health?.status === 'ok', ...identity };
  }

  async function recommend(input) {
    const { value, usage } = await chat(
      'You are a cost-control recommendation engine. Return only JSON with recommendations[]. Allowed actionType values: TRANSFER, REPAIR, REPLACE, HOLD. Never invent assetId values not present in the input.',
      { organizationId: input.organizationId, query: input.query, assets: input.assets }
    );
    return { recommendations: value.recommendations, usage };
  }

  async function ocr(input) {
    const { value, usage } = await chat(
      'Extract inventory fields from the supplied text. Return only the schema-constrained JSON object. Use the same non-empty keys in fields and confidence. Field values are strings and confidence values are numbers from 0 to 1.',
      { organizationId: input.organizationId, assetId: input.assetId, fileId: input.fileId, text: input.text },
      { type: 'json_object', schema: OCR_RESPONSE_SCHEMA }
    );
    const result = validateOcrResult(value);
    return { fields: result.fields, confidence: result.confidence, usage };
  }

  return { ready, recommend, ocr };
}

module.exports = { OCR_RESPONSE_SCHEMA, createLlamaRuntimeAdapter, jsonObject, loopbackUrl, validateOcrResult };
