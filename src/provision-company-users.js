const fs = require('node:fs');
const { createPool } = require('./db');
const { provisionCompanyUsers } = require('./company-user-provisioning');

async function main() {
  const input = fs.readFileSync(0);
  if (input.length === 0 || input.length > 1024 * 1024) throw new Error('company user manifest size is invalid.');
  const manifest = JSON.parse(input.toString('utf8'));
  const pool = createPool(process.env.DATABASE_URL);
  try {
    const result = await provisionCompanyUsers(pool, manifest);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ status:'FAIL', reason:error.message })}\n`);
  process.exitCode = 1;
});
