const fs = require('node:fs');
const { Pool } = require('pg');
const { provisionCompanyMasters } = require('./company-master-provisioning');

const MAX_INPUT_BYTES = 1024 * 1024;
const chunks = [];
let bytes = 0;
process.stdin.on('data', chunk => {
  bytes += chunk.length;
  if (bytes > MAX_INPUT_BYTES) {
    process.stderr.write('company master manifest exceeds input limit.\n');
    process.exit(1);
  }
  chunks.push(chunk);
});
process.stdin.on('end', async () => {
  const pool = new Pool({ connectionString:process.env.DATABASE_URL });
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const result = await provisionCompanyMasters(pool, input);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('company master provisioning failed.\n');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
});
