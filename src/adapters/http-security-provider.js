const DEFAULT_TIMEOUT_MS = 30_000;

function createHttpSecurityProvider(config, fetchImpl = fetch) {
  const scanUrl = String(config.malwareScannerUrl || '').trim();
  const healthUrl = String(config.malwareScannerHealthUrl || '').trim();
  const alertUrl = String(config.alertingUrl || '').trim();
  const apiKey = String(config.malwareScannerApiKey || '').trim();
  const alertingApiKey = String(config.alertingApiKey || apiKey).trim();
  const timeoutMs = Number(config.malwareScannerTimeoutMs || DEFAULT_TIMEOUT_MS);
  if (!scanUrl || !healthUrl || !alertUrl || !apiKey || !alertingApiKey) throw new Error('P3 security provider URLs and key-file credentials are required.');

  async function request(url, { method = 'GET', body, key = apiKey, contentType = 'application/json', headers = {} } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        body,
        signal: controller.signal,
        headers: { accept: 'application/json', authorization: `Bearer ${key}`, ...(body ? { 'content-type': contentType } : {}), ...headers }
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) throw new Error(`Security provider HTTP ${response.status}.`);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  async function alert(category) {
    return request(alertUrl, { method: 'POST', key: alertingApiKey, body: JSON.stringify({ category }) });
  }

  async function scan(content, metadata = {}) {
    if (!Buffer.isBuffer(content) || content.length < 1) throw new Error('Security scan content is required.');
    let result;
    try {
      const uploadContentType = String(metadata.contentType || '').toLowerCase();
      result = await request(scanUrl, { method: 'POST', body: content, contentType: 'application/octet-stream', headers: { 'x-sqcm-content-type': uploadContentType } });
      if (!['clean', 'infected'].includes(result.status)) result = { ...result, status: 'unknown' };
    } catch (error) {
      result = { status: error?.name === 'AbortError' ? 'timeout' : 'unknown', engine: 'Microsoft Defender Antivirus' };
    }
    if (result.status !== 'clean') {
      const category = result.status === 'infected' ? 'MALWARE_INFECTED' : result.status === 'timeout' ? 'MALWARE_TIMEOUT' : 'MALWARE_UNKNOWN';
      const receipt = await alert(category);
      result.alertReceiptId = receipt.receiptId;
    }
    return result;
  }

  async function healthCheck() {
    const result = await request(healthUrl);
    if (result.scanner?.status !== 'ok' || result.alerting?.status !== 'ok') throw new Error('Security provider is not ready.');
    return { status: 'ok', driver: 'MICROSOFT_DEFENDER_BRIDGE', engineVersion: result.scanner.engineVersion, signatureVersion: result.scanner.signatureVersion };
  }

  return { driver: 'MICROSOFT_DEFENDER_BRIDGE', scan, healthCheck };
}

module.exports = { createHttpSecurityProvider };
