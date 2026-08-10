const path = require('node:path');
const { validateOperationalAdapters } = require('./contracts');
const { createHttpAiProvider } = require('./http-ai-provider');

async function loadOperationalAdapters(config) {
  if (!config.operationalAdapterModule) {
    const builtIn = config.aiProviderDriver === 'external' ? { aiProvider: createHttpAiProvider(config) } : {};
    return validateOperationalAdapters(config, builtIn);
  }
  const modulePath = path.resolve(config.operationalAdapterModule);
  const factory = require(modulePath);
  if (typeof factory.createOperationalAdapters !== 'function') {
    throw new Error('Operational adapter module must export createOperationalAdapters(config).');
  }
  return validateOperationalAdapters(config, await factory.createOperationalAdapters(config));
}

module.exports = { loadOperationalAdapters };
