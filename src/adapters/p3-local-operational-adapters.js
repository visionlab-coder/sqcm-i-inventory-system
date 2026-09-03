const { createHttpAiProvider } = require('./http-ai-provider');
const { createHttpSecurityProvider } = require('./http-security-provider');

async function createOperationalAdapters(config) {
  if (config.env === 'production') throw new Error('P3 local operational adapters cannot run in production.');
  return {
    aiProvider: createHttpAiProvider(config),
    malwareScanner: createHttpSecurityProvider(config)
  };
}

module.exports = { createOperationalAdapters };
