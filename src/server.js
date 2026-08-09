const { getConfig } = require('./config');
const { createPool, initializeDatabase } = require('./db');
const { createApp } = require('./app');
const { loadOperationalAdapters } = require('./adapters/loader');

async function main() {
  const config = getConfig();
  const pool = createPool(config.databaseUrl);
  await initializeDatabase(pool, config);
  const adapters = await loadOperationalAdapters(config);
  const app = createApp({ pool, config, ...adapters });
  const server = app.listen(config.port, () => console.log(JSON.stringify({ event: 'server_started', port: config.port, env: config.env })));

  const shutdown = signal => {
    console.log(JSON.stringify({ event: 'server_shutdown', signal }));
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
