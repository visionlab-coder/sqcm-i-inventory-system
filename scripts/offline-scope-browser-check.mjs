// Isolated synthetic IndexedDB test. Does not contact an application, DB, or provider.
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleSource = await readFile(path.join(root, 'frontend/offline-stocktake.js'));
const fixture = await readFile(path.join(root, 'test/offline-scope-browser.fixture.js'));
const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/module.js' || req.url === '/fixture.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(req.url === '/module.js' ? moduleSource : fixture);
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><pre id="result">NOT_RUN</pre><script src="/module.js"></script><script src="/fixture.js"></script>');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = await mkdtemp(path.join(tmpdir(), 'sqcm-offline-synthetic-'));
try {
  const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', `--user-data-dir=${profile}`, '--remote-debugging-port=0',
    `http://127.0.0.1:${server.address().port}/`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.resume();
  child.stderr.resume();
  const exited = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  const delay = () => new Promise(resolve => setTimeout(resolve, 100));
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); }
    catch { await delay(); }
  }
  if (!port) throw new Error('Synthetic Chrome startup timeout; profile retained');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  const pending = new Map(); let id = 0;
  socket.onmessage = event => {
    const result = JSON.parse(event.data); const cb = pending.get(result.id);
    if (cb) { pending.delete(result.id); result.error ? cb.reject(new Error(result.error.message)) : cb.resolve(result.result); }
  };
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  let result = { status: 'NOT_RUN' };
  try {
    for (let i = 0; i < 100; i++) {
      const read = await send('Runtime.evaluate', { expression: 'document.querySelector("#result")?.textContent', returnByValue: true });
      const value = read.result?.value;
      if (value?.startsWith('{')) { result = JSON.parse(value); break; }
      await delay();
    }
  } finally { await send('Browser.close'); socket.close(); }
  const code = await exited;
  console.log(JSON.stringify({ ...result, browserExitCode: code, syntheticOnly: true, legacyProductionDataTouched: false }, null, 2));
  if (code !== 0 || result.status !== 'PASS') process.exitCode = 1;
} finally {
  server.close();
  // Retain only this synthetic profile for recovery; never recursively remove user profiles.
}
