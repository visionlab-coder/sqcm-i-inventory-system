import process from 'node:process';
import dbModule from '../src/db.js';
import configModule from '../src/config.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { runAutomationOnce } = require('../src/automation/worker.js');
const config = configModule.getConfig();
const pool = dbModule.createPool(config.databaseUrl);
try {
  const result = await runAutomationOnce(pool);
  console.log(JSON.stringify({ event: 'automation_worker_run', ...result }));
} finally {
  await pool.end();
}
