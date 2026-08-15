import crypto from 'node:crypto';
import fs from 'node:fs';

const githubEnv = process.env.GITHUB_ENV;
if (!githubEnv) {
  console.error('GITHUB_ENV is required. This command is only for GitHub Actions.');
  process.exit(2);
}

const token = bytes => crypto.randomBytes(bytes).toString('hex');
const postgresPassword = token(24);
const values = {
  POSTGRES_PASSWORD: postgresPassword,
  SESSION_SECRET: token(32),
  MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  SEED_ADMIN_PASSWORD: `${token(16)}Aa1!`,
  SEED_MANAGER_PASSWORD: `${token(16)}Aa1!`,
  SEED_USER_PASSWORD: `${token(16)}Aa1!`,
  INTEGRATION_DATABASE_URL: `postgres://seowon:${postgresPassword}@localhost:55432/seowon_inventory`
};

fs.appendFileSync(githubEnv, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
console.log('Ephemeral CI credentials were generated and written to GITHUB_ENV.');
