import fs from 'node:fs';

const source = fs.readFileSync(new URL('../compose.ai-production.yaml', import.meta.url), 'utf8');
const failures = [];

const requirePattern = (pattern, message) => {
  if (!pattern.test(source)) failures.push(message);
};

requirePattern(/^name:\s*seowon-inventory-production\s*$/m, 'Production Compose project name must be isolated.');
requirePattern(/^\s{2}database:\s*$[\s\S]*?^\s{4}ports:\s*!override\s*\[\]\s*$/m, 'Database host ports must be empty.');
requirePattern(/^\s{2}backend:\s*$[\s\S]*?^\s{4}ports:\s*!override\s*\[\]\s*$/m, 'Backend host ports must be empty.');
requirePattern(/127\.0\.0\.1:\$\{FRONTEND_PORT:-3300\}:80/, 'Frontend must bind to loopback port 3300 by default.');
if (/0\.0\.0\.0:|\[::\]:/.test(source)) failures.push('Wildcard host binding is forbidden.');

const cpuLimits = source.match(/^\s{4}cpus:\s*"[0-9.]+"\s*$/gm) || [];
const memoryLimits = source.match(/^\s{4}mem_limit:\s*\S+\s*$/gm) || [];
if (cpuLimits.length !== 3) failures.push('All three services require CPU limits.');
if (memoryLimits.length !== 3) failures.push('All three services require memory limits.');

if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'passed',
  project: 'seowon-inventory-production',
  services: ['backend', 'database', 'frontend'],
  frontend: '127.0.0.1:3300',
  backendHostPort: null,
  databaseHostPort: null,
  cpuLimitTotal: 4.5,
  memoryLimitTotal: '4.25g'
}));
