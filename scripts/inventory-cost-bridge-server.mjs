import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createInventoryCostBridge } = require('../src/bridge/inventory-cost-bridge');
const { createLlamaRuntimeAdapter } = require('../src/bridge/llama-runtime-adapter');
const { createWindowsDefenderScanner } = require('../src/bridge/windows-defender-scanner');
const { createWindowsSessionAlertSink } = require('../src/bridge/windows-session-alert-sink');

function requiredFile(value, label) {
  const target = path.resolve(String(value || '').trim());
  if (!target || !fs.statSync(target).isFile()) throw new Error(`${label} must reference a file.`);
  return target;
}

const configArgumentIndex = process.argv.indexOf('--config-file');
const configInput = configArgumentIndex >= 0 ? process.argv[configArgumentIndex + 1] : process.env.SQCMI_BRIDGE_CONFIG_FILE;
const configFile = requiredFile(configInput, 'bridge config file');
const rawConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const bearerToken = fs.readFileSync(requiredFile(rawConfig.bearerTokenFile, 'bearerTokenFile'), 'utf8').trim();
const runtimeApiKey = fs.readFileSync(requiredFile(rawConfig.runtimeApiKeyFile, 'runtimeApiKeyFile'), 'utf8').trim();
const host = String(rawConfig.host || '127.0.0.1');
if (!['127.0.0.1', '::1'].includes(host)) throw new Error('Bridge host must be loopback.');
const port = Number(rawConfig.port || 18766);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Bridge port is invalid.');

const runtime = createLlamaRuntimeAdapter({ runtimeUrl: rawConfig.runtimeUrl, timeoutMs: rawConfig.runtimeTimeoutMs, apiKey: runtimeApiKey });
const security = rawConfig.security || null;
const malwareScanner = security ? createWindowsDefenderScanner({
  executable: security.defenderExecutable,
  powershellExecutable: security.powershellExecutable,
  scanRoot: security.scanRoot,
  timeoutMs: security.scanTimeoutMs
}) : null;
const alertSink = security ? createWindowsSessionAlertSink({
  executable: security.messageExecutable,
  recipient: security.alertRecipient,
  auditFile: security.alertAuditFile,
  timeoutMs: security.alertTimeoutMs
}) : null;
const app = createInventoryCostBridge({ config: { ...rawConfig, bearerToken }, runtime, malwareScanner, alertSink });
const server = app.listen(port, host, () => console.log(JSON.stringify({ event: 'inventory_cost_bridge_started', host, port, provider: rawConfig.provider })));

function shutdown(signal) {
  console.log(JSON.stringify({ event: 'inventory_cost_bridge_stopping', signal }));
  server.close(error => process.exit(error ? 1 : 0));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
