function createHttpEventPublisher(config, fetchImpl = fetch) {
  const url = String(config.eventPublisherUrl || '').trim();
  const apiKey = String(config.eventPublisherApiKey || '').trim();
  let endpoint;
  try {
    endpoint = new URL(url);
  } catch {
    endpoint = null;
  }
  const stagingLoopbackHosts = new Set(['host.docker.internal', '127.0.0.1', 'localhost', '::1']);
  const isHttps = endpoint?.protocol === 'https:';
  const isStagingLoopback = config.env === 'staging'
    && endpoint?.protocol === 'http:'
    && stagingLoopbackHosts.has(endpoint.hostname);
  const isAiPcProductionLoopback = config.env === 'production'
    && config.fileStorageDriver === 'postgres'
    && config.authProvider === 'local'
    && config.localAuthMfaRequired === true
    && endpoint?.protocol === 'http:'
    && stagingLoopbackHosts.has(endpoint.hostname);
  if ((!isHttps && !isStagingLoopback && !isAiPcProductionLoopback) || !apiKey) {
    throw new Error('HTTPS event publisher URL and credential are required; staging loopback HTTP only and authenticated AI PC production loopback are permitted.');
  }

  async function request(body = null) {
    const response = await fetchImpl(url, {
      method: body ? 'POST' : 'HEAD',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new Error(`Event publisher HTTP ${response.status}.`);
    return body ? response.json() : null;
  }

  return {
    driver: isHttps ? 'HTTPS' : 'HTTP_LOOPBACK',
    async publish(event) {
      const result = await request(event);
      if (!result?.receiptId) throw new Error('Event publisher receipt is required.');
      return { id: result.receiptId };
    },
    async healthCheck() {
      await request();
      return { status: 'ok', driver: isHttps ? 'HTTPS' : 'HTTP_LOOPBACK' };
    }
  };
}

module.exports = { createHttpEventPublisher };
