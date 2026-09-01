import { resolve4, resolveCname } from 'node:dns/promises';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { evaluateProductionPublicProbe, PRODUCTION_PUBLIC_EXPECTED_RESPONSES } from '../src/operations/production-public-probe.mjs';

const hostname = 'inventory.safe-link.co.kr';
const now = new Date();
const insideWindow = now >= new Date(PRODUCTION_CHANGE_WINDOW.start)
  && now <= new Date(PRODUCTION_CHANGE_WINDOW.end);

const settled = await Promise.allSettled([resolve4(hostname), resolveCname(hostname)]);
const dnsPublished = settled.some((result) => result.status === 'fulfilled' && result.value.length > 0);
const responses = {};

if (dnsPublished && insideWindow) {
  for (const path of Object.keys(PRODUCTION_PUBLIC_EXPECTED_RESPONSES)) {
    try {
      const response = await fetch(`https://${hostname}${path}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
        headers: { accept: path.endsWith('.png') ? 'image/png' : 'application/json' }
      });
      responses[path] = {
        status: response.status,
        tlsVerified: true,
        finalHostname: new URL(response.url).hostname
      };
    } catch {
      responses[path] = { status: null, tlsVerified: false, finalHostname: null };
    }
  }
}

const result = evaluateProductionPublicProbe({ dnsPublished, insideWindow, responses });
console.log(JSON.stringify({
  checkedAt: now.toISOString(),
  hostname,
  dnsPublished,
  insideWindow,
  expectedPaths: Object.keys(PRODUCTION_PUBLIC_EXPECTED_RESPONSES),
  ...result
}, null, 2));

if (result.status.startsWith('FAIL_')) process.exitCode = 1;
