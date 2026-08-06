const { getConfig } = require('./config');
const { createPool, initializeDatabase } = require('./db');
const { createApp } = require('./app');

async function main() {
  const config = getConfig();
  const pool = createPool(config.databaseUrl);
  await initializeDatabase(pool, config);
  const app = createApp({ pool, config });
  const server = app.listen(config.port, () => console.log(`서원토건 비품관리: http://localhost:${config.port}`));

  const shutdown = signal => {
    console.log(`${signal} 수신: 안전하게 종료합니다.`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(error => {
  console.error('애플리케이션 시작 실패:', error.message);
  process.exit(1);
});
