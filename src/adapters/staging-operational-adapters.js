const { createHttpAiProvider } = require('./http-ai-provider');
const { createHttpEventPublisher } = require('./http-event-publisher');
const { createHttpSecurityProvider } = require('./http-security-provider');
const { createSupabaseOidcProvider } = require('./supabase-oidc-provider');
const { createSupabaseS3FileStore } = require('./supabase-s3-file-store');

async function createOperationalAdapters(config) {
  if (!['staging', 'production'].includes(config.env)) throw new Error('Supabase operational adapters require staging or production.');
  return {
    fileStore: createSupabaseS3FileStore(config),
    oidcProvider: createSupabaseOidcProvider(config),
    malwareScanner: createHttpSecurityProvider(config),
    aiProvider: createHttpAiProvider(config),
    ...(config.eventPublisherUrl ? { eventPublisher: createHttpEventPublisher(config) } : {})
  };
}

module.exports = { createOperationalAdapters };
