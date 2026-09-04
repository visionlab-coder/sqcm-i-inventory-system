import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const baseUrl = required('C1_BROWSER_BASE_URL').replace(/\/$/, '');
const email = required('C1_BROWSER_EMAIL');
const password = required('C1_BROWSER_PASSWORD');
const outputDir = path.resolve(process.env.C1_BROWSER_OUTPUT_DIR || 'artifacts/c1-browser');
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      await readFile(candidate);
      return candidate;
    } catch {}
  }
  throw new Error('Chrome executable was not found');
}

async function waitForJson(url, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`Chrome DevTools endpoint did not become ready: ${url}`);
}

function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  };
  const opened = new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('Chrome DevTools websocket failed'));
  });
  return {
    opened,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); }
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error('Browser evaluation failed');
  return result.result.value;
}

async function waitFor(cdp, expression, label, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function capture(cdp, name, width, height, mobile) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile
  });
  await sleep(250);
  const metrics = await evaluate(cdp, `(() => ({
    title: document.title,
    heading: document.querySelector('h1')?.textContent?.trim(),
    importTitle: document.querySelector('#asset-import-title')?.textContent?.trim(),
    viewport: { width: innerWidth, height: innerHeight },
    scrollWidth: document.documentElement.scrollWidth,
    hasHorizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    liveRegion: document.querySelector('#asset-import-result')?.getAttribute('aria-live'),
    fileLabel: document.querySelector('input[name="assetCsv"]')?.closest('label')?.textContent?.trim(),
    templateHref: document.querySelector('a[href*="/assets/import/template.csv"]')?.getAttribute('href'),
    mobileHeader: (() => { const element = document.querySelector('.mobile-title'); const rect = element?.getBoundingClientRect(); return { text: element?.textContent?.trim(), display: element && getComputedStyle(element).display, width: rect?.width || 0, height: rect?.height || 0 }; })()
  }))()`);
  if (metrics.importTitle !== 'Excel 원장 대량등록') throw new Error(`${name}: import panel missing`);
  if (metrics.viewport.width !== width || metrics.viewport.height !== height) throw new Error(`${name}: viewport mismatch`);
  if (metrics.hasHorizontalOverflow) throw new Error(`${name}: horizontal overflow detected`);
  if (metrics.liveRegion !== 'polite' || !metrics.fileLabel || !metrics.templateHref) throw new Error(`${name}: accessibility contract failed`);
  if (mobile && (metrics.mobileHeader.display === 'none' || metrics.mobileHeader.width <= 0 || metrics.mobileHeader.height <= 0)) throw new Error(`${name}: mobile header is not visible`);
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(outputDir, `${name}-${width}x${height}.png`);
  await writeFile(file, Buffer.from(screenshot.data, 'base64'));
  const bytes = await readFile(file);
  return { ...metrics, file, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}

const chrome = await firstExisting(chromeCandidates);
const profile = await mkdtemp(path.join(os.tmpdir(), 'sqcm-c1-browser-'));
const port = 54817;
let child;
let cdp;

try {
  await mkdir(outputDir, { recursive: true });
  child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, baseUrl
  ], { stdio: 'ignore', windowsHide: true });
  const pages = await waitForJson(`http://127.0.0.1:${port}/json/list`);
  const page = pages.find(item => item.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('Chrome page target was not found');
  cdp = connectCdp(page.webSocketDebuggerUrl);
  await cdp.opened;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await waitFor(cdp, `document.querySelector('form') && document.querySelector('input[type="email"]') && typeof state !== 'undefined' && Boolean(state.csrfToken)`, 'login form security context');
  await evaluate(cdp, `(() => {
    const set = (selector, value) => {
      const input = document.querySelector(selector);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('input[type="email"]', ${JSON.stringify(email)});
    set('input[type="password"]', ${JSON.stringify(password)});
    document.querySelector('#login-form button[type="submit"]').click();
    return true;
  })()`);
  await waitFor(cdp, `location.hash.includes('dashboard')`, 'authenticated dashboard');
  await evaluate(cdp, `document.querySelector('[data-view="asset-register"]').click()`);
  await waitFor(cdp, `document.querySelector('#asset-import-title')`, 'Excel import screen');
  const desktop = await capture(cdp, 'desktop', 1440, 900, false);
  const mobile = await capture(cdp, 'mobile', 390, 844, true);
  const result = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    status: 'PASS',
    baseUrl,
    syntheticAccount: true,
    captures: { desktop, mobile }
  };
  const resultPath = path.join(outputDir, 'result.json');
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: result.status, resultPath, captures: result.captures }, null, 2));
} finally {
  cdp?.close();
  if (child && !child.killed) child.kill();
  await sleep(200);
  await rm(profile, { recursive: true, force: true });
}
