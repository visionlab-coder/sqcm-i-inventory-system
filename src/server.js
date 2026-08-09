const { getConfig } = require('./config');
const { createPool, initializeDatabase } = require('./db');
const { createApp } = require('./app');
const { loadOperationalAdapters } = require('./adapters/loader');
const { publishBatch } = require('./services/outbox-service');

async function main() {
  const config = getConfig();
  const pool = createPool(config.databaseUrl);
  await initializeDatabase(pool, config);
  const adapters = await loadOperationalAdapters(config);
  const app = createApp({ pool, config, ...adapters });
  const server = app.listen(config.port, () => console.log(JSON.stringify({ event: 'server_started', port: config.port, env: config.env })));
  let publishing=false;
  const publishTimer=adapters.eventPublisher?setInterval(async()=>{if(publishing)return;publishing=true;try{const results=await publishBatch(pool,adapters.eventPublisher,config.outboxBatchSize);if(results.length)console.log(JSON.stringify({event:'outbox_batch',results}));}catch(error){console.error(JSON.stringify({event:'outbox_publish_error',message:error.message}));}finally{publishing=false;}},config.outboxPollIntervalMs):null;

  const shutdown = signal => {
    console.log(JSON.stringify({ event: 'server_shutdown', signal }));
    if(publishTimer) clearInterval(publishTimer);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(error => {
  console.error(JSON.stringify({ event: 'server_start_failed', name: error.name, message: error.message }));
  process.exit(1);
});
