const path = require('node:path');
const { validateOperationalAdapters } = require('./contracts');

async function loadOperationalAdapters(config) {
  if (!config.operationalAdapterModule) return validateOperationalAdapters(config, {});
  const modulePath = path.resolve(config.operationalAdapterModule);
  const factory = require(modulePath);
  if (typeof factory.createOperationalAdapters !== 'function') {
    throw new Error('Operational adapter module must export createOperationalAdapters(config).');
  }
  return validateOperationalAdapters(config, await factory.createOperationalAdapters(config));
}

module.exports = { loadOperationalAdapters };
