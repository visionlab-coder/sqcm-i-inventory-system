const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const app = fs.readFileSync('frontend/app.js','utf8');
for (const failure of [false,true]) test(`late ${failure?'failed':'successful'} screen request must not replace newer navigation`, async () => {
  let finish;
  const pending = new Promise(resolve => { finish=resolve; });
  const root={innerHTML:''};
  const ctx=vm.createContext({
    state:{}, URL, location:{href:'http://localhost/'}, history:{replaceState(){}},
    window:{scrollTo(){}}, closeMobileNav(){}, document:{querySelectorAll:()=>[]},
    $: selector => selector==='#view-root'?root:{focus(){},scrollTop:0},
    escapeHtml:String, sessionBoundary:{version:()=>0}, sessionChanges:new Set(),
    mutatingMethods:new Set(['POST']), inFlightWrites:new Map(),
    fetch:async()=>{await pending;if(failure)throw new Error('old request failed');return {status:200};},
    responseData:async()=>({}),
  });
  vm.runInContext(app.slice(app.indexOf('async function request('),app.indexOf('async function uploadBinary(')),ctx);
  vm.runInContext(app.slice(app.indexOf('async function navigate('),app.indexOf('async function renderDashboard(')),ctx);
  ctx.renderDashboard=async()=>{await ctx.request('/old');root.innerHTML='OLD';};
  ctx.renderAssets=async()=>{root.innerHTML='NEW';};
  const old=ctx.navigate('dashboard');
  await ctx.navigate('assets');
  finish();await old;
  assert.equal(root.innerHTML,'NEW');
  assert.equal(ctx.state.view,'assets');
});
test('navigation changes during JSON decoding reject old reads but do not relabel completed writes', async () => {
  for (const method of ['GET','POST','AUTH']) {
    const state={navigationRevision:0};
    const ctx=vm.createContext({state,sessionBoundary:{version:()=>0},sessionChanges:new Set(),
      mutatingMethods:new Set(['POST']),inFlightWrites:new Map(),newIdempotencyKey:()=> 'synthetic',
      fetch:async()=>({status:200}),responseData:async()=>{state.navigationRevision++;return {saved:true};}});
    vm.runInContext(app.slice(app.indexOf('async function request('),app.indexOf('async function uploadBinary(')),ctx);
    if(method==='GET') await assert.rejects(ctx.request('/synthetic',{method}),e=>e.code==='NAVIGATION_CHANGED');
    else assert.equal((await ctx.request(method==='AUTH'?'/api/auth/csrf':'/synthetic',{method:method==='AUTH'?'GET':method})).saved,true);
  }
});
