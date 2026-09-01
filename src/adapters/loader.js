const path = require('node:path');
const { validateOperationalAdapters } = require('./contracts');
const { createHttpAiProvider } = require('./http-ai-provider');
const { PostgresFileStore } = require('../storage/postgres-file-store');

async function loadOperationalAdapters(config, { pool } = {}) {
  const builtIn = {};
  if (config.aiProviderDriver === 'external' && !config.operationalAdapterModule) builtIn.aiProvider = createHttpAiProvider(config);
  if (config.fileStorageDriver === 'postgres') builtIn.fileStore = new PostgresFileStore(pool);
  if (!config.operationalAdapterModule) {
    return validateOperationalAdapters(config, builtIn);
  }
  const modulePath = path.resolve(config.operationalAdapterModule);
  const factory = require(modulePath);
  if (typeof factory.createOperationalAdapters !== 'function') {
    throw new Error('Operational adapter module must export createOperationalAdapters(config).');
  }
  const external = await factory.createOperationalAdapters(config);
  return validateOperationalAdapters(config, { ...builtIn, ...external });
}

module.exports = { loadOperationalAdapters };
