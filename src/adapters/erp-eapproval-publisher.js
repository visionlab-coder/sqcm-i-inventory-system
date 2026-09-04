const crypto = require('node:crypto');
const { buildErpOutboxEnvelope, canonicalJson } = require('../integrations/hr-erp-contract');

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function publisherError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createErpEapprovalPublisher(config, fetchImpl = fetch, now = () => new Date()) {
  let endpoint;
  try { endpoint = new URL(String(config?.endpoint || '')); } catch { endpoint = null; }
  const providerId = String(config?.providerId || '').trim();
  const secret = String(config?.secret || '');
  if (!endpoint || endpoint.protocol !== 'https:') throw new Error('ERP/e-approval HTTPS endpoint is required.');
  if (!SAFE_ID.test(providerId)) throw new Error('ERP/e-approval provider ID is invalid.');
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('ERP/e-approval signing secret must be at least 32 bytes.');

  return {
    driver: 'ERP_EAPPROVAL_HTTPS_HMAC',
    providerId,
    async publish(event) {
      const current = new Date(now());
      const timestamp = String(Math.floor(current.getTime() / 1000));
      const envelope = buildErpOutboxEnvelope(event, { occurredAt: current.toISOString() });
      const body = canonicalJson(envelope);
      const signature = crypto.createHmac('sha256', secret).update(timestamp).update('.').update(body).digest('hex');
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'idempotency-key': envelope.idempotencyKey,
          'x-sqcm-provider': providerId,
          'x-sqcm-timestamp': timestamp,
          'x-sqcm-signature': `v1=${signature}`
        },
        body,
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw publisherError(response.status === 408 || response.status === 504 ? 'ERP_PROVIDER_TIMEOUT' : 'ERP_PROVIDER_HTTP_ERROR');
      const declared = Number(response.headers?.get?.('content-length') || 0);
      if (declared > 65_536) throw publisherError('OUTBOX_RECEIPT_TOO_LARGE');
      const responseText = typeof response.text === 'function' ? await response.text() : JSON.stringify(await response.json());
      if (Buffer.byteLength(responseText, 'utf8') > 65_536) throw publisherError('OUTBOX_RECEIPT_TOO_LARGE');
      let receipt;
      try { receipt = JSON.parse(responseText); } catch { throw publisherError('OUTBOX_RECEIPT_INVALID'); }
      const receiptId = String(receipt?.receiptId || '').trim();
      if (!SAFE_ID.test(receiptId)) throw publisherError('OUTBOX_RECEIPT_INVALID');
      return {
        id: receiptId,
        provider: providerId,
        responseSha256: crypto.createHash('sha256').update(responseText).digest('hex')
      };
    },
    async healthCheck() { return { status: 'configured', driver: 'ERP_EAPPROVAL_HTTPS_HMAC' }; }
  };
}

module.exports = { createErpEapprovalPublisher };
