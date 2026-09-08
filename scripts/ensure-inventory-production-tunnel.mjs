import { existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PRODUCTION_INGRESS_TARGET,
  productionIngressTunnelConnected,
  selectProductionIngressTunnel
} from '../src/operations/production-ingress-publication.mjs';
import {
  observeProductionIngressProcess,
  readProductionIngressConfig,
  runIngressCommand,
  startProductionIngressProcess
} from '../src/operations/production-ingress-publication-runtime.mjs';

const CLOUDFLARED = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const PROTECTED_TUNNEL_NAME = 'sqcm-i';
const PROTECTED_PUBLIC_TARGETS = [
  { url: 'https://sqcm.safe-link.co.kr/os', accepted: (status) => status === 200 },
  { url: 'https://safe-link.co.kr', accepted: (status) => status >= 200 && status < 400 }
];
const INVENTORY_PUBLIC_URL = 'https://inventory.safe-link.co.kr/';
const execute = process.argv.includes('--execute');

function physicalFile(filePath) {
  try {
    return existsSync(filePath)
      && lstatSync(filePath).isFile()
      && !lstatSync(filePath).isSymbolicLink()
      && path.resolve(realpathSync(filePath)).toLowerCase() === path.resolve(filePath).toLowerCase();
  } catch {
    return false;
  }
}

function listTunnels() {
  const result = runIngressCommand(CLOUDFLARED, ['tunnel', 'list', '--output', 'json']);
  if (!result.ok) throw new Error(result.failure === 'COMMAND_TIMEOUT' ? 'TUNNEL_LIST_TIMEOUT' : 'TUNNEL_LIST_FAILED');
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { throw new Error('TUNNEL_LIST_INVALID'); }
  if (!Array.isArray(parsed)) throw new Error('TUNNEL_LIST_INVALID');
  return parsed;
}

function protectedTunnel(tunnels) {
  const matches = tunnels.filter((item) => item?.name === PROTECTED_TUNNEL_NAME
    && item?.deleted_at === '0001-01-01T00:00:00Z' && Array.isArray(item.connections));
  if (matches.length !== 1) throw new Error('PROTECTED_TUNNEL_IDENTITY_INVALID');
  return matches[0];
}

function activeConnections(tunnel) {
  return tunnel.connections.filter((connection) => connection?.is_pending_reconnect === false).length;
}

async function httpStatus(url) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    return response.status;
  } catch {
    return 0;
  }
}

function validateLocalInputs(tunnelId) {
  if (!physicalFile(CLOUDFLARED)) throw new Error('CLOUDFLARED_BINARY_INVALID');
  const config = readProductionIngressConfig({
    runtimeDirectory: PRODUCTION_INGRESS_TARGET.runtimeDirectory,
    configPath: PRODUCTION_INGRESS_TARGET.configPath
  });
  const normalized = config.text.replace(/\r\n/g, '\n');
  if (!normalized.includes(`tunnel: ${tunnelId}\n`)
    || !normalized.includes(`  - hostname: ${PRODUCTION_INGRESS_TARGET.hostname}\n`)
    || !normalized.includes(`    service: ${PRODUCTION_INGRESS_TARGET.origin}\n`)) {
    throw new Error('PRODUCTION_TUNNEL_CONFIG_MISMATCH');
  }
  const credential = normalized.match(/^credentials-file:\s*(.+)$/m)?.[1]?.trim();
  if (!credential || !physicalFile(credential)) throw new Error('PRODUCTION_TUNNEL_CREDENTIAL_INVALID');
  return config.bytes;
}

async function verifyPublicEndpoints() {
  const inventory = await httpStatus(INVENTORY_PUBLIC_URL);
  const protectedStatuses = Object.fromEntries(await Promise.all(
    PROTECTED_PUBLIC_TARGETS.map(async ({ url }) => [url, await httpStatus(url)]))) ;
  return {
    inventory,
    protectedStatuses,
    pass: inventory === 200 && PROTECTED_PUBLIC_TARGETS.every(({ url, accepted }) => accepted(protectedStatuses[url]))
  };
}

async function main() {
  const before = listTunnels();
  const protectedBefore = protectedTunnel(before);
  const protectedConnectionsBefore = activeConnections(protectedBefore);
  if (protectedConnectionsBefore < 1) {
    console.log(JSON.stringify({
      status: 'HOLD_PROTECTED_SQCM_TUNNEL_UNAVAILABLE',
      mutationPerformed: false,
      protectedConnectionsBefore
    }));
    return;
  }

  const inventoryBefore = selectProductionIngressTunnel({
    tunnels: before,
    expectedName: PRODUCTION_INGRESS_TARGET.tunnelName
  });
  if (!inventoryBefore) throw new Error('PRODUCTION_TUNNEL_NOT_FOUND');
  const configBytes = validateLocalInputs(inventoryBefore.id);
  const originStatus = await httpStatus(`${PRODUCTION_INGRESS_TARGET.origin}/api/health`);
  if (originStatus !== 200) {
    console.log(JSON.stringify({ status: 'HOLD_INVENTORY_ORIGIN_UNHEALTHY', mutationPerformed: false, originStatus }));
    return;
  }

  let processStarted = false;
  let processId = null;
  if (!productionIngressTunnelConnected(inventoryBefore)) {
    const observed = observeProductionIngressProcess({
      cloudflared: CLOUDFLARED,
      configPath: PRODUCTION_INGRESS_TARGET.configPath
    });
    if (observed.running) {
      console.log(JSON.stringify({
        status: 'READY_WAIT_EXISTING_INVENTORY_TUNNEL_RECONNECT',
        mutationPerformed: false,
        processId: observed.processId,
        protectedConnectionsBefore
      }));
      return;
    }
    if (!execute) {
      console.log(JSON.stringify({
        status: 'READY_INVENTORY_TUNNEL_START',
        mutationPerformed: false,
        protectedConnectionsBefore,
        originStatus,
        configBytes
      }));
      return;
    }
    const started = await startProductionIngressProcess({
      cloudflared: CLOUDFLARED,
      configPath: PRODUCTION_INGRESS_TARGET.configPath,
      runtimeDirectory: PRODUCTION_INGRESS_TARGET.runtimeDirectory
    });
    processStarted = true;
    processId = started.processId;
  }

  let after = before;
  let inventoryAfter = inventoryBefore;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    after = listTunnels();
    inventoryAfter = selectProductionIngressTunnel({
      tunnels: after,
      expectedName: PRODUCTION_INGRESS_TARGET.tunnelName
    });
    if (productionIngressTunnelConnected(inventoryAfter)) break;
    await delay(2_000);
  }
  const protectedAfter = protectedTunnel(after);
  const protectedConnectionsAfter = activeConnections(protectedAfter);
  const inventoryConnections = activeConnections(inventoryAfter);
  if (protectedAfter.id !== protectedBefore.id || protectedConnectionsAfter < 1) {
    throw new Error('PROTECTED_SQCM_TUNNEL_CHANGED');
  }
  if (inventoryConnections < 1) throw new Error('INVENTORY_TUNNEL_CONNECTION_NOT_ESTABLISHED');

  const publicEndpoints = await verifyPublicEndpoints();
  const output = {
    status: publicEndpoints.pass ? 'PASS_INVENTORY_TUNNEL_AVAILABLE' : 'FAIL_PUBLIC_ENDPOINT_VERIFICATION',
    mutationPerformed: processStarted,
    processStarted,
    processId,
    inventoryConnections,
    protectedConnectionsBefore,
    protectedConnectionsAfter,
    originStatus,
    publicEndpoints
  };
  console.log(JSON.stringify(output));
  if (!publicEndpoints.pass) process.exitCode = 1;
}

await main().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAIL_INVENTORY_TUNNEL_WATCHDOG',
    failure: String(error?.message || 'UNKNOWN').replace(/[\r\n]/g, ' ').slice(0, 160),
    mutationPerformed: false
  }));
  process.exitCode = 1;
});
