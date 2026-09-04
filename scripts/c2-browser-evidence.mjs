import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const required = name => { const value=process.env[name]; if(!value) throw new Error(`${name} is required`); return value; };
const baseUrl = required('C2_BROWSER_BASE_URL').replace(/\/$/, '');
const email = required('C2_BROWSER_EMAIL');
const password = required('C2_BROWSER_PASSWORD');
const outputDir = path.resolve(process.env.C2_BROWSER_OUTPUT_DIR || 'artifacts/c2-browser');
const chromeCandidates = [process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function firstExisting(paths) { for(const candidate of paths){try{await readFile(candidate);return candidate;}catch{}} throw new Error('Chrome executable was not found'); }
async function waitForJson(url) { for(let attempt=0;attempt<60;attempt+=1){try{const response=await fetch(url);if(response.ok)return response.json();}catch{}await sleep(100);}throw new Error('Chrome DevTools endpoint did not become ready'); }
function connectCdp(url) {
  const socket=new WebSocket(url); const pending=new Map(); let nextId=1;
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(!message.id||!pending.has(message.id))return;const callbacks=pending.get(message.id);pending.delete(message.id);message.error?callbacks.reject(new Error(message.error.message)):callbacks.resolve(message.result);};
  return { opened:new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=()=>reject(new Error('Chrome DevTools websocket failed'));}), send(method,params={}){const id=nextId++;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}, close(){socket.close();} };
}
async function evaluate(cdp,expression){const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error('Browser evaluation failed');return result.result.value;}
async function waitFor(cdp,expression,label){for(let attempt=0;attempt<100;attempt+=1){if(await evaluate(cdp,expression))return;await sleep(100);}throw new Error(`Timed out waiting for ${label}`);}
async function capture(cdp,name,width,height,mobile,publicId){
  await evaluate(cdp,`history.replaceState({},'',${JSON.stringify(`#scan=${publicId}`)})`);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
  await waitFor(cdp,`document.querySelector('#qr-open-detail')`,'responsive QR result');await sleep(250);
  const metrics=await evaluate(cdp,`(() => { const input=document.querySelector('#qr-code-input'); const rect=input?.getBoundingClientRect(); return {heading:document.querySelector('h1')?.textContent?.trim(),resultHeading:document.querySelector('#qr-result h2')?.textContent?.trim(),viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth,hasHorizontalOverflow:document.documentElement.scrollWidth>innerWidth,manualInput:{width:rect?.width||0,height:rect?.height||0},cameraButton:document.querySelector('#qr-camera-start')?.textContent?.trim(),resultLive:document.querySelector('#qr-result')?.getAttribute('aria-live')}; })()`);
  if(metrics.heading!=='QR로 자산 찾기'||!metrics.resultHeading)throw new Error(`${name}: QR result screen missing (${JSON.stringify(metrics)})`);
  if(metrics.hasHorizontalOverflow||metrics.manualInput.width<=0||metrics.manualInput.height<=0)throw new Error(`${name}: responsive input contract failed`);
  if(metrics.resultLive!=='polite'||!metrics.cameraButton)throw new Error(`${name}: accessibility contract failed`);
  const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}); const file=path.join(outputDir,`${name}-${width}x${height}.png`); await writeFile(file,Buffer.from(shot.data,'base64')); const bytes=await readFile(file);
  return {...metrics,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}

const chrome=await firstExisting(chromeCandidates); const profile=await mkdtemp(path.join(os.tmpdir(),'sqcm-c2-browser-')); const port=54818; let child; let cdp;
try {
  await mkdir(outputDir,{recursive:true});
  child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,baseUrl],{stdio:'ignore',windowsHide:true});
  const pages=await waitForJson(`http://127.0.0.1:${port}/json/list`); const page=pages.find(item=>item.type==='page'); if(!page?.webSocketDebuggerUrl)throw new Error('Chrome page target was not found');
  cdp=connectCdp(page.webSocketDebuggerUrl);await cdp.opened;await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  await waitFor(cdp,`document.querySelector('#login-form') && typeof state !== 'undefined' && Boolean(state.csrfToken)`,'login form');
  await evaluate(cdp,`(() => { const set=(selector,value)=>{const input=document.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));};set('input[type="email"]',${JSON.stringify(email)});set('input[type="password"]',${JSON.stringify(password)});document.querySelector('#login-form button[type="submit"]').click();return true;})()`);
  await waitFor(cdp,`location.hash.includes('dashboard') && document.querySelector('h1')?.textContent?.trim() === '현장 자산 지휘판'`,'authenticated dashboard');
  const publicId=await evaluate(cdp,`fetch('/api/enterprise/assets?size=1',{credentials:'same-origin'}).then(r=>r.json()).then(v=>v.assets?.[0]?.qr_public_id||'')`); if(!publicId)throw new Error('No QR-enabled asset was available');
  await evaluate(cdp,`document.querySelector('[data-view="qr-scan"]').click()`);await waitFor(cdp,`document.querySelector('#qr-manual-form')`,'QR scan screen');
  await evaluate(cdp,`(() => { const input=document.querySelector('#qr-code-input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(publicId)});input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#qr-manual-form button[type="submit"]').click();return true;})()`);
  await waitFor(cdp,`document.querySelector('#qr-open-detail')`,'authorized QR result');
  const desktop=await capture(cdp,'desktop',1440,900,false,publicId); const mobile=await capture(cdp,'mobile',390,844,true,publicId);
  const result={schemaVersion:1,checkedAt:new Date().toISOString(),status:'PASS',baseUrl,syntheticAccount:true,captures:{desktop,mobile}}; const resultPath=path.join(outputDir,'result.json');await writeFile(resultPath,`${JSON.stringify(result,null,2)}\n`,'utf8');console.log(JSON.stringify({status:'PASS',resultPath,captures:result.captures},null,2));
} finally { cdp?.close(); if(child&&!child.killed)child.kill(); await sleep(200); await rm(profile,{recursive:true,force:true}); }
