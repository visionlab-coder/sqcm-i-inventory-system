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
const uiFiles = new Map();
for (const file of ['index.html', 'app.js', 'session-boundary.js', 'offline-stocktake.js', 'ui-components.js', 'styles.css', 'brand.css', 'experience.css', 'evidence.css']) {
  uiFiles.set('/' + file, await readFile(path.join(root, 'frontend', file)));
}
const syntheticUser = { id: 101, organizationId: 101, departmentId: 101, role: 'MANAGER', displayName: 'Synthetic manager', passwordResetRequired: false };
const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    const data = pathname === '/api/auth/me' || pathname === '/api/auth/login' ? { user: syntheticUser, csrfToken: 'synthetic-only' }
      : pathname === '/api/auth/csrf' ? { csrfToken: 'synthetic-only' }
      : pathname === '/api/auth/config' ? { authProvider: 'local' }
      : pathname === '/api/enterprise/stocktakes/1' ? { stocktake: { name: 'Synthetic stocktake' }, items: [] } : {};
    res.end(JSON.stringify(data)); return;
  }
  if (pathname === '/app' || uiFiles.has(pathname)) {
    res.setHeader('Content-Type', pathname === '/app' || pathname.endsWith('.html') ? 'text/html; charset=utf-8' : pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(uiFiles.get(pathname === '/app' ? '/index.html' : pathname)); return;
  }
  if (pathname === '/sw.js') { res.statusCode = 404; res.end(); return; }
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
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  let result = { status: 'NOT_RUN' };
  try {
    for (let i = 0; i < 100; i++) {
      const read = await send('Runtime.evaluate', { expression: 'document.querySelector("#result")?.textContent', returnByValue: true });
      const value = read.result?.value;
      if (value?.startsWith('{')) { result = JSON.parse(value); break; }
      await delay();
    }
    if (result.status === 'PASS') {
      const sessions = [];
      const evaluate = async (sid, expression) => {
        const value = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid);
        if (value.exceptionDetails) throw new Error('Synthetic UI evaluation failed');
        return value.result?.value;
      };
      const waitFor = async (sid, expression) => {
        for (let i = 0; i < 100; i++) { if (await evaluate(sid, expression)) return; await delay(); }
        throw new Error('Synthetic UI timeout');
      };
      for (let i = 0; i < 2; i++) {
        const target = await send('Target.createTarget', { url: `http://127.0.0.1:${server.address().port}/app` });
        const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
        sessions.push(attached.sessionId);
        await waitFor(attached.sessionId, 'typeof state !== "undefined" && state.user?.id === 101');
        await evaluate(attached.sessionId, 'renderStocktakeDetail(1)');
      }
      const [a, b] = sessions;
      if (!(await evaluate(b, 'document.querySelector("[role=note]")?.textContent.includes("사이트 데이터를 삭제하지")'))) throw new Error('Recovery notice missing');
      result.checks.push('actual SPA recovery notice rendered');
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, b);
      if (!(await evaluate(b, 'document.documentElement.scrollWidth <= innerWidth'))) throw new Error('Mobile horizontal overflow');
      result.checks.push('actual SPA mobile 390px no horizontal overflow');
      await evaluate(a, 'document.querySelector("#logout-button").click()');
      for (const sid of sessions) await waitFor(sid, 'state.user === null && document.querySelector("#app-shell").classList.contains("hidden") && document.querySelector("#view-root").innerHTML === ""');
      result.checks.push('actual SPA logout clears both browser tabs');
      result.apiMode = 'SYNTHETIC_HTTP_NO_AUTHENTICATED_BACKEND';
    }
  } finally { await send('Browser.close'); socket.close(); }
  const code = await exited;
  console.log(JSON.stringify({ ...result, browserExitCode: code, syntheticOnly: true, legacyProductionDataTouched: false }, null, 2));
  if (code !== 0 || result.status !== 'PASS') process.exitCode = 1;
} finally {
  server.close();
  // Retain only this synthetic profile for recovery; never recursively remove user profiles.
}
