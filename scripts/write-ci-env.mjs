import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';

const githubEnv = process.env.GITHUB_ENV;
if (!githubEnv) {
  console.error('GITHUB_ENV is required. This command is only for GitHub Actions.');
  process.exit(2);
}

const token = bytes => crypto.randomBytes(bytes).toString('hex');
const reserveLoopbackPorts = async count => {
  const servers = [];
  try {
    for (let index = 0; index < count; index += 1) {
      const server = net.createServer();
      server.unref();
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      servers.push(server);
    }
    return servers.map(server => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Failed to reserve a loopback port.');
      }
      return address.port;
    });
  } finally {
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  }
};

const [frontendPort, postgresPort, backendPort] = await reserveLoopbackPorts(3);
const postgresPassword = token(24);
const values = {
  FRONTEND_PORT: String(frontendPort),
  CI_POSTGRES_HOST_PORT: String(postgresPort),
  CI_BACKEND_HOST_PORT: String(backendPort),
  POSTGRES_PASSWORD: postgresPassword,
  SESSION_SECRET: token(32),
  MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  SEED_ADMIN_PASSWORD: `${token(16)}Aa1!`,
  SEED_MANAGER_PASSWORD: `${token(16)}Aa1!`,
  SEED_USER_PASSWORD: `${token(16)}Aa1!`,
  INTEGRATION_DATABASE_URL: `postgres://seowon:${postgresPassword}@127.0.0.1:${postgresPort}/seowon_inventory`,
  INTEGRATION_BASE_URL: `http://127.0.0.1:${frontendPort}`,
  NONFUNCTIONAL_BASE_URL: `http://127.0.0.1:${frontendPort}`,
  RECOVERY_BASE_URL: `http://127.0.0.1:${frontendPort}`
};

fs.appendFileSync(githubEnv, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
console.log('Ephemeral CI credentials were generated and written to GITHUB_ENV.');
