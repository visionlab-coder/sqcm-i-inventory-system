const test=require('node:test');
const assert=require('node:assert/strict');
const {getConfig}=require('../../src/config');
test('background worker freeze disables both timers, even with configured providers',()=>{
 const {startBackgroundWorkers}=require('../../src/automation/runtime-workers');
 const config=getConfig({BACKGROUND_WORKERS_ENABLED:'false',AUTOMATION_WORKER_ENABLED:'true'});
 const forbidden=()=>{throw Error('worker started while frozen');};
 const workers=startBackgroundWorkers({config,pool:{},eventPublisher:{},publishBatch:forbidden,createAutomationScheduler:forbidden,setInterval:forbidden,clearInterval:forbidden});
 assert.equal(workers.enabled,false);workers.stop();
});
test('background worker switch rejects typo instead of enabling workers',()=>{
 assert.throws(()=>getConfig({BACKGROUND_WORKERS_ENABLED:'flase'}),/BACKGROUND_WORKERS_ENABLED/);
});
test('normal worker defaults retain publishing and scheduler with cleanup',async()=>{
 const {startBackgroundWorkers}=require('../../src/automation/runtime-workers');
 const config=getConfig({BACKGROUND_WORKERS_ENABLED:'true',AUTOMATION_WORKER_ENABLED:'true'});
 let tick,published=0,stopped=0,cleared=0;
 const workers=startBackgroundWorkers({config,pool:{},eventPublisher:{},publishBatch:async()=>{published++;return [];},createAutomationScheduler:()=>({stop(){stopped++;}}),setInterval:fn=>{tick=fn;return 7;},clearInterval:id=>{assert.equal(id,7);cleared++;}});
 await tick();assert.equal(published,1);workers.stop();assert.equal(stopped,1);assert.equal(cleared,1);
});
