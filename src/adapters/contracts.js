function requireMethods(adapter, name, methods) {
  if (!adapter || typeof adapter !== 'object') throw new Error(`${name} adapter is required.`);
  for (const method of methods) {
    if (typeof adapter[method] !== 'function') throw new Error(`${name} adapter must implement ${method}().`);
  }
  return adapter;
}

function validateOperationalAdapters(config, adapters = {}) {
  const result = { ...adapters };
  if (['external', 'postgres'].includes(config.fileStorageDriver)) {
    requireMethods(result.fileStore, 'fileStore', ['write', 'read', 'removeNew', 'healthCheck']);
    const driver = String(result.fileStore.driver || '').toUpperCase();
    if (driver === 'LOCAL') throw new Error('Production fileStore cannot use the LOCAL driver.');
    if (config.fileStorageDriver === 'postgres' && driver !== 'POSTGRES') throw new Error('PostgreSQL file storage requires the POSTGRES driver.');
  }
  if (config.malwareScanDriver === 'external') {
    requireMethods(result.malwareScanner, 'malwareScanner', ['scan', 'healthCheck']);
    if(String(result.malwareScanner.driver||'').toUpperCase()==='MOCK') throw new Error('Production malwareScanner cannot use the MOCK driver.');
  }
  if (config.authProvider === 'oidc') requireMethods(result.oidcProvider, 'oidcProvider', ['authorizationUrl', 'exchangeCode', 'healthCheck']);
  if (config.outboxPublisherRequired) requireMethods(result.eventPublisher, 'eventPublisher', ['publish', 'healthCheck']);
  if (config.aiProviderDriver === 'external') {
    requireMethods(result.aiProvider, 'aiProvider', ['recommend', 'healthCheck', 'readinessCheck']);
    requireMethods(result.aiProvider.ocr, 'aiProvider.ocr', ['extract']);
  }
  return result;
}

module.exports = { requireMethods, validateOperationalAdapters };
