const crypto = require('node:crypto');
const express = require('express');

const ACTIONS = new Set(['TRANSFER', 'REPAIR', 'REPLACE', 'HOLD']);

function nonEmpty(value, label, maxLength = 200) {
  const text = String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim();
  if (!text) throw Object.assign(new Error(`${label} is required.`), { status: 400 });
  return text.slice(0, maxLength);
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw Object.assign(new Error(`${label} must be a positive integer.`), { status: 400 });
  return parsed;
}

function secureEqual(left, right) {
  const first = Buffer.from(String(left || ''));
  const second = Buffer.from(String(right || ''));
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function bearerGuard(expectedToken) {
  const token = nonEmpty(expectedToken, 'Bridge bearer token', 4096);
  return (request, response, next) => {
    const authorization = String(request.get('authorization') || '');
    const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!secureEqual(supplied, token)) return response.status(401).json({ error: 'UNAUTHORIZED' });
    return next();
  };
}

function validateRuntime(runtime) {
  if (!runtime || typeof runtime !== 'object') throw new Error('Runtime adapter is required.');
  for (const method of ['ready', 'recommend', 'ocr']) {
    if (typeof runtime[method] !== 'function') throw new Error(`Runtime adapter must implement ${method}().`);
  }
  return runtime;
}

function modelIdentity(config = {}) {
  const modelVersion = nonEmpty(config.modelVersion, 'Bridge model version', 120);
  const modelChecksum = String(config.modelChecksum || '').trim().toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(modelChecksum)) throw new Error('Bridge model checksum must be a sha256 digest.');
  return { modelVersion, modelChecksum };
}

function organizationGuard(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('Bridge allowed organization IDs are required.');
  const allowed = new Set(values.map(value => positiveInteger(value, 'allowed organizationId')));
  return value => {
    const organizationId = positiveInteger(value, 'organizationId');
    if (!allowed.has(organizationId)) throw Object.assign(new Error('Organization is not allowed.'), { status: 403 });
    return organizationId;
  };
}

function createInventoryCostBridge({ config = {}, runtime, malwareScanner = null, alertSink = null }) {
  const adapter = validateRuntime(runtime);
  const identity = modelIdentity(config);
  const provider = nonEmpty(config.provider || 'inventory-cost-bridge', 'Bridge provider', 80);
  const organization = organizationGuard(config.allowedOrganizationIds);
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_request, response) => response.json({ status: 'ok', provider }));
  app.use(bearerGuard(config.bearerToken));

  if (malwareScanner) {
    app.post('/security/scan', express.raw({ type: 'application/octet-stream', limit: '6mb' }), async (request, response, next) => {
      try {
        const contentType = String(request.get('x-sqcm-content-type') || '').toLowerCase();
        const result = await malwareScanner.scan(request.body, { contentType });
        return response.json(result);
      } catch (error) {
        return next(error);
      }
    });
  }

  app.use(express.json({ limit: '256kb' }));

  if (malwareScanner && alertSink) {
    app.get('/security/health', async (_request, response, next) => {
      try {
        const [scanner, alerting] = await Promise.all([malwareScanner.healthCheck(), alertSink.healthCheck()]);
        return response.json({ status: 'ok', scanner, alerting });
      } catch (error) {
        return next(Object.assign(error, { status: 503 }));
      }
    });
    app.post('/alerts', async (request, response, next) => {
      try {
        return response.status(202).json(await alertSink.send({ category: request.body?.category }));
      } catch (error) {
        return next(error);
      }
    });
  }

  app.head('/events/publish', (_request, response) => response.status(204).end());
  app.post('/events/publish', (request, response) => {
    const idempotencyKey = nonEmpty(request.body?.idempotencyKey || request.body?.id, 'event idempotency key', 200);
    const receiptId = crypto.createHash('sha256').update(`${provider}:${idempotencyKey}`).digest('hex').slice(0, 32);
    console.log(JSON.stringify({ event: 'inventory_event_received', receiptId, eventType: String(request.body?.type || '').slice(0, 120) }));
    response.status(202).json({ receiptId });
  });

  app.get('/ready', async (_request, response, next) => {
    try {
      const result = await adapter.ready(identity);
      if (result?.ready !== true) return response.status(503).json({ status: 'not_ready', provider, modelVersion: identity.modelVersion });
      if (malwareScanner && (await malwareScanner.healthCheck())?.status !== 'ok') return response.status(503).json({ status: 'not_ready', provider, modelVersion: identity.modelVersion });
      if (alertSink && (await alertSink.healthCheck())?.status !== 'ok') return response.status(503).json({ status: 'not_ready', provider, modelVersion: identity.modelVersion });
      return response.json({ status: 'ready', provider, ...identity });
    } catch (error) {
      return next(Object.assign(error, { status: 503 }));
    }
  });

  app.post('/recommend', async (request, response, next) => {
    try {
      const organizationId = organization(request.body?.organizationId);
      const query = request.body?.query && typeof request.body.query === 'object' && !Array.isArray(request.body.query) ? request.body.query : {};
      const assets = Array.isArray(request.body?.assets) ? request.body.assets.slice(0, 50) : null;
      if (!assets) throw Object.assign(new Error('assets must be an array.'), { status: 400 });
      const result = await adapter.recommend({ organizationId, query, assets, ...identity });
      const allowedAssets = new Set(assets.map(asset => Number(asset?.id)).filter(Number.isInteger));
      const recommendations = Array.isArray(result?.recommendations) ? result.recommendations.filter(item => allowedAssets.has(Number(item?.assetId)) && ACTIONS.has(String(item?.actionType || '').toUpperCase())).slice(0, 20) : null;
      if (!recommendations) throw new Error('Runtime recommend response must contain recommendations[].');
      return response.json({ provider, modelVersion: identity.modelVersion, recommendations, usage: result.usage && typeof result.usage === 'object' ? result.usage : null });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/ocr', async (request, response, next) => {
    try {
      const organizationId = organization(request.body?.organizationId);
      const assetId = request.body?.assetId == null ? null : positiveInteger(request.body.assetId, 'assetId');
      const fileId = request.body?.fileId == null ? null : positiveInteger(request.body.fileId, 'fileId');
      const text = String(request.body?.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 10_000);
      if (!assetId && !fileId && !text) throw Object.assign(new Error('assetId, fileId or text is required.'), { status: 400 });
      const result = await adapter.ocr({ organizationId, assetId, fileId, text, ...identity });
      if (!result?.fields || typeof result.fields !== 'object' || Array.isArray(result.fields)) throw new Error('Runtime OCR response must contain fields.');
      if (!result?.confidence || typeof result.confidence !== 'object' || Array.isArray(result.confidence)) throw new Error('Runtime OCR response must contain confidence.');
      return response.json({ fields: result.fields, confidence: result.confidence, usage: result.usage && typeof result.usage === 'object' ? result.usage : null });
    } catch (error) {
      return next(error);
    }
  });

  app.use((error, _request, response, _next) => {
    const status = Number.isInteger(error?.status) ? error.status : 502;
    const code = status === 400 ? 'INVALID_REQUEST' : status === 403 ? 'ORGANIZATION_FORBIDDEN' : status === 503 ? 'RUNTIME_NOT_READY' : 'RUNTIME_ERROR';
    response.status(status).json({ error: code });
  });
  return app;
}

module.exports = { createInventoryCostBridge, modelIdentity, organizationGuard, secureEqual };
