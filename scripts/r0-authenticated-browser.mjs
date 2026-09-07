import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Transparent transport to the fresh isolated Nginx; no API responses are mocked.
const relayCode = `let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',async()=>{try{
const q=JSON.parse(input);const r=await fetch('http://frontend'+q.path,{method:q.method,headers:q.headers,body:q.body?Buffer.from(q.body,'base64'):undefined,redirect:'manual',signal:AbortSignal.timeout(15000)});
const headers=Object.fromEntries(r.headers);delete headers['content-length'];delete headers['content-encoding'];delete headers['transfer-encoding'];headers['set-cookie']=r.headers.getSetCookie();
console.log(JSON.stringify({status:r.status,headers,body:Buffer.from(await r.arrayBuffer()).toString('base64')}));}catch{process.exitCode=1;}});`;

export async function verifyAuthenticatedBrowser({ backendId, password, excel = false }) {
  assert.match(backendId, /^[a-f0-9]{64}$/);
  const server = createServer(async (req, res) => {
    try {
      if (!req.url.startsWith('/') || req.url.startsWith('//')) { res.writeHead(400).end(); return; }
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 6 * 1024 * 1024) throw new Error('size'); chunks.push(chunk); }
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([key]) => !['host', 'connection', 'content-length', 'accept-encoding'].includes(key)));
      const child = spawn('docker', ['exec', '-i', backendId, 'node', '-e', relayCode], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', data => output += data); child.stderr.resume();
      const result = new Promise((resolve, reject) => {
        child.on('error', reject); child.on('close', code => code === 0 ? resolve(output) : reject(new Error('relay')));
      });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({ path: req.url, method: req.method, headers, body: Buffer.concat(chunks).toString('base64') }));
      const response = JSON.parse(await result);
      res.writeHead(response.status, response.headers); res.end(Buffer.from(response.body, 'base64'));
    } catch { res.writeHead(502).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(path.join(tmpdir(), 'sqcm-auth-synthetic-'));
  const child = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.resume(); child.stderr.resume();
  const exited = new Promise((resolve, reject) => { child.on('close', resolve); child.on('error', reject); });
  const delay = () => new Promise(resolve => setTimeout(resolve, 100));
  let socket; let send;
  const checks = [];
  try {
    let port;
    for (let i = 0; i < 100 && !port; i++) {
      try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { await delay(); }
    }
    assert.ok(port, 'Chrome startup timeout');
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    const pending = new Map(); let id = 0;
    socket.onmessage = event => {
      const response = JSON.parse(event.data); const cb = pending.get(response.id);
      if (cb) { clearTimeout(cb.timer); pending.delete(response.id); response.error ? cb.reject(new Error('CDP command failed')) : cb.resolve(response.result); }
    };
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 30_000);
      pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params, sessionId }));
    });
    const evaluate = async (sid, expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid);
      if (result.exceptionDetails) throw new Error('Browser expression failed; sensitive details omitted');
      return result.result?.value;
    };
    const wait = async (sid, expression, label) => {
      for (let i = 0; i < 150; i++) { if (await evaluate(sid, expression)) return; await delay(); }
      throw new Error(`Browser gate timeout: ${label}`);
    };
    const tab = async () => {
      const target = await send('Target.createTarget', { url: origin });
      return (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
    };
    const a = await tab();
    await wait(a, 'typeof state!=="undefined" && !!state.csrfToken', 'anonymous bootstrap');
    const login = async (sid, email) => {
      await evaluate(sid, `(()=>{const f=document.querySelector('#login-form');f.elements.email.value=${JSON.stringify(email)};f.elements.password.value=${JSON.stringify(password)};f.requestSubmit();})()`);
    };
    await login(a, 'manager@seowon.local');
    await wait(a, 'state.user?.role==="MANAGER" && !document.querySelector("#app-shell").classList.contains("hidden")', 'manager form login');
    checks.push('real browser login form authenticates synthetic manager');
    await evaluate(a, 'document.querySelector("[data-view=stocktakes]").click()');
    await wait(a, 'document.querySelector("#view-root").textContent.includes("R0 synthetic stocktake")', 'stocktake list');
    checks.push('stocktake menu displays actual PostgreSQL fixture');
    await evaluate(a, 'document.querySelector(".stocktake-open[data-id=\\"1\\"]").click()');
    await wait(a, 'document.querySelector("[role=note]") && document.querySelector("#view-root").textContent.includes("현장 노트북")', 'stocktake detail');
    checks.push('authenticated stocktake detail and recovery notice rendered');
    const b = await tab();
    await wait(b, 'typeof state!=="undefined" && state.user?.role==="MANAGER"', 'shared session bootstrap');
    await evaluate(b, 'document.querySelector("[data-view=stocktakes]").click()');
    await wait(b, '!!document.querySelector(".stocktake-open")', 'second tab stocktake list');
    await evaluate(b, 'document.querySelector(".stocktake-open[data-id=\\"1\\"]").click()');
    await wait(b, '!!document.querySelector("[role=note]")', 'second tab stocktake detail');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, b);
    assert.ok(await evaluate(b, 'document.documentElement.scrollWidth<=innerWidth'), 'mobile overflow');
    checks.push('authenticated mobile 390x844 no horizontal overflow');
    if (excel) {
      await evaluate(a, 'renderAssetRegister()');
      await wait(a, '!!document.querySelector("#asset-import")', 'import form');
      const upload = async csv => evaluate(a, `(()=>{const f=document.querySelector('#asset-import');const d=new DataTransfer();d.items.add(new File([${JSON.stringify(csv)}],'synthetic.csv',{type:'text/csv'}));f.elements.assetCsv.files=d.files;f.elements.assetCsv.dispatchEvent(new Event('change'));f.querySelector('button[type=submit]').click();})()`);
      await upload('자산번호,자산명\nR0-BROWSER-001,"노트북"오류');
      await wait(a, '!!document.querySelector("#asset-import-result [role=alert]")', 'CSV syntax error visible');
      assert.ok(await evaluate(a, '!document.querySelector("#asset-import-commit")'));
      checks.push('invalid CSV displays server error and no commit control');
      await upload('자산번호,자산명\nR0-BROWSER-001,합성 브라우저 노트북');
      await wait(a, 'document.querySelector("#asset-import-commit")?.disabled===false', 'corrected CSV preview');
      checks.push('corrected file can be previewed and committed');
      // Confirm only this synthetic import; real employee confirmation is NOT_RUN.
      await evaluate(a, 'window.confirm=()=>true;document.querySelector("#asset-import-commit").click()');
      await wait(a, 'document.querySelector("#view-root").textContent.includes("R0-BROWSER-001") && !document.querySelector("#asset-import")', 'import visible in real asset list');
      checks.push('corrected CSV import appears in actual backend asset list');
    }
    await evaluate(a, 'document.querySelector("#logout-button").click()');
    for (const sid of [a, b]) await wait(sid, 'state.user===null && document.querySelector("#app-shell").classList.contains("hidden") && document.querySelector("#view-root").innerHTML===""', 'cross-tab logout');
    checks.push('real server logout clears both browser tabs');
    assert.equal(await evaluate(b, 'fetch("/api/enterprise/stocktakes/1").then(r=>r.status)'), 401);
    checks.push('browser cookie rejected by backend after logout');
    await wait(a, '!!state.csrfToken', 'logout CSRF bootstrap');
    await login(a, 'employee@seowon.local');
    await wait(a, 'state.user?.role==="USER"', 'USER form login');
    assert.equal(await evaluate(a, 'fetch("/api/enterprise/stocktakes/1").then(r=>r.status)'), 403);
    checks.push('account switch to USER cannot read manager stocktake');
    await evaluate(a, 'document.querySelector("#logout-button").click()');
    await wait(a, 'state.user===null', 'final logout');
    return { status: 'PASS', checks, syntheticOnly: true, apiMocked: false, employeeUat: 'NOT_RUN' };
  } finally {
    if (send) { await send('Browser.close'); socket.close(); assert.equal(await exited, 0); }
    await new Promise(resolve => server.close(resolve));
    // Synthetic profile retained. No personal browser or filesystem cleanup.
  }
}
