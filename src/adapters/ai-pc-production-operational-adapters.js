const { createHttpAiProvider } = require('./http-ai-provider');
const { createHttpEventPublisher } = require('./http-event-publisher');
const { createHttpSecurityProvider } = require('./http-security-provider');

async function createOperationalAdapters(config) {
  if (config.env !== 'production') throw new Error('AI PC production adapters require production mode.');
  if (config.fileStorageDriver !== 'postgres') throw new Error('AI PC production requires PostgreSQL file storage.');
  if (config.authProvider !== 'local' || config.localAuthMfaRequired !== true) {
    throw new Error('AI PC production requires MFA-protected local authentication.');
  }
  return {
    aiProvider: createHttpAiProvider(config),
    malwareScanner: createHttpSecurityProvider(config),
    eventPublisher: createHttpEventPublisher(config)
  };
}

module.exports = { createOperationalAdapters };
