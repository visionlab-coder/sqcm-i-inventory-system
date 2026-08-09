function requireMethods(adapter, name, methods) {
  if (!adapter || typeof adapter !== 'object') throw new Error(`${name} adapter is required.`);
  for (const method of methods) {
    if (typeof adapter[method] !== 'function') throw new Error(`${name} adapter must implement ${method}().`);
  }
  return adapter;
}

function validateOperationalAdapters(config, adapters = {}) {
  const result = { ...adapters };
  if (config.fileStorageDriver === 'external') {
    requireMethods(result.fileStore, 'fileStore', ['write', 'read', 'removeNew', 'healthCheck']);
    if(String(result.fileStore.driver||'').toUpperCase()==='LOCAL') throw new Error('Production external fileStore cannot use the LOCAL driver.');
  }
  if (config.malwareScanDriver === 'external') {
    requireMethods(result.malwareScanner, 'malwareScanner', ['scan', 'healthCheck']);
    if(String(result.malwareScanner.driver||'').toUpperCase()==='MOCK') throw new Error('Production malwareScanner cannot use the MOCK driver.');
  }
  if (config.authProvider === 'oidc') requireMethods(result.oidcProvider, 'oidcProvider', ['authorizationUrl', 'exchangeCode', 'healthCheck']);
  if (config.outboxPublisherRequired) requireMethods(result.eventPublisher, 'eventPublisher', ['publish', 'healthCheck']);
  return result;
}

module.exports = { requireMethods, validateOperationalAdapters };
