// Real Docker failure recovery, exclusively on this invocation's synthetic stack.
// No production configuration, host ports, external networks, named volumes or Secrets.
import {spawnSync} from 'node:child_process';
import {randomBytes, randomUUID, createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {executeR5Deployment} from '../src/operations/r5-deployment-executor.mjs';
import {createR5MutationDriver} from '../src/operations/r5-mutation-driver.mjs';

const failAt=process.argv.find(v=>v.startsWith('--fail-at='))?.slice(10);
assert.ok(['migrate','switchImages'].includes(failAt),'Choose --fail-at=migrate or --fail-at=switchImages');
const sha=process.argv.find(v=>v.startsWith('--candidate-sha='))?.slice(16);
assert.match(sha || '',/^[a-f0-9]{40}$/);
const project=`sqcm-r5-recovery-${randomUUID().replaceAll('-','').slice(0,12)}`;
const password=randomBytes(24).toString('hex');
const digest=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
let commandOutcomeUnknown=false;
function docker(args,input, binary=false) {
  const result=spawnSync('docker',args,{input,encoding:binary?undefined:'utf8',windowsHide:true,timeout:150_000,maxBuffer:32*1024*1024});
  // Raw Docker diagnostics, environment and SQL never enter output.
  if(result.error?.code==='ETIMEDOUT') {
    commandOutcomeUnknown=true;
    throw Object.assign(new Error('R5_DOCKER_COMMAND_TIMEOUT'),{code:'R5_COMMAND_OUTCOME_UNKNOWN'});
  }
  if(result.error || result.status!==0) throw new Error(`R5_DOCKER_${args[0].toUpperCase()}_FAILED`);
  return binary?result.stdout:result.stdout.trim();
}
const image=tag=>JSON.parse(docker(['image','inspect',tag]))[0];
const oldBackend=image('ghcr.io/visionlab-coder/sqcm-i-inventory-backend:sha-38b2bca7f34a7a950469c8d0cd6d2a4b11e3b7a6').Id;
const oldFrontend=image('ghcr.io/visionlab-coder/sqcm-i-inventory-frontend:sha-38b2bca7f34a7a950469c8d0cd6d2a4b11e3b7a6').Id;
const candidates=Object.fromEntries(['backend','frontend'].map(service=> {
  const info=image(`sqcm-r4-${service}:sha-${sha}`);
  assert.equal(info.Config.Labels?.['org.opencontainers.image.revision'],sha);
  return [service,info.Id];
}));
const spec={services:{
  database:{image:image('postgres:16-alpine').Id,pull_policy:'never',mem_limit:'256m',tmpfs:['/var/lib/postgresql/data'],environment:{POSTGRES_DB:'r5_synthetic',POSTGRES_USER:'r5',POSTGRES_PASSWORD:password},healthcheck:{test:['CMD','pg_isready','-U','r5','-d','r5_synthetic'],interval:'2s',timeout:'2s',retries:30}},
  backend:{image:oldBackend,pull_policy:'never',mem_limit:'512m',command:['node','src/server.js'],environment:{NODE_ENV:'test',PORT:'8080',DATABASE_URL:`postgres://r5:${password}@database:5432/r5_synthetic`,SESSION_SECRET:randomBytes(32).toString('hex'),DB_AUTO_MIGRATE:'true',DB_RUN_SEEDS:'true',SEED_ADMIN_PASSWORD:password,SEED_MANAGER_PASSWORD:password,SEED_USER_PASSWORD:password,AUTH_PROVIDER:'local',COOKIE_SECURE:'false',AUTOMATION_WORKER_ENABLED:'false',FILE_STORAGE_DRIVER:'postgres'},depends_on:{database:{condition:'service_healthy'}},healthcheck:{test:['CMD','wget','-q','--spider','http://127.0.0.1:8080/api/health'],interval:'2s',timeout:'2s',retries:30}},
  frontend:{image:oldFrontend,pull_policy:'never',mem_limit:'128m',depends_on:{backend:{condition:'service_healthy'}}}
},networks:{default:{internal:true}}};
function compose(...args) {
  assert.deepEqual(Object.keys(spec.services).sort(),['backend','database','frontend']);
  assert.ok(Object.values(spec.services).every(s=>!s.ports&&!s.volumes&&!s.network_mode));
  assert.equal(spec.networks.default.internal,true);
  return docker(['compose','--project-name',project,'--env-file',process.platform==='win32'?'NUL':'/dev/null','-f','-',...args],JSON.stringify(spec));
}
function owned(service) {
  const id=compose('ps','-aq',service);assert.match(id,/^[a-f0-9]{64}$/);
  const info=JSON.parse(docker(['inspect',id]))[0];
  assert.equal(info.Config.Labels['com.docker.compose.project'],project);
  assert.equal(info.Config.Labels['com.docker.compose.service'],service);
  assert.deepEqual(info.HostConfig.PortBindings || {},{});
  return {id,info};
}
const sql=(database,query)=>docker(['exec','-i',owned('database').id,'psql','-X','-A','-t','-U','r5','-d',database,'-v','ON_ERROR_STOP=1'],query);
function fingerprint(database) {
  const out={};
  for(const table of ['assets','workflow_requests','asset_cost_events','schema_migrations']) {
    out[table]=sql(database,`SELECT count(*)::text||':'||md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'')) FROM ${table} t;`);
  }
  return out;
}
const receipt=(ctx,fields)=>({runId:ctx.runId,candidateSha:sha,...fields});
let dump,backupFingerprint,archives,backupDigest,migrationVerified=false,runtimeRestored=false,started=false,recoveryStep='NOT_STARTED';
const actions={
  async freeze(ctx) {
    compose('stop','--timeout','20','frontend','backend');
    for(const service of ['frontend','backend'])assert.equal(owned(service).info.State.Running,false);
    assert.equal(sql('r5_synthetic',"SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend';"),'0');
    return {ingressBlocked:true,workersStopped:true,activeWritesZero:true};
  },
  async backup(ctx) {
    backupFingerprint=fingerprint('r5_synthetic');assert.ok(backupFingerprint.schema_migrations.startsWith('25:'));
    const front=owned('frontend').id;
    archives=['index.html','app.js','experience.css'].map(file=>({file,tar:docker(['cp',`${front}:/usr/share/nginx/html/${file}`,'-'],undefined,true)}));
    assert.ok(archives.every(a=>a.tar.length>0));
    dump=docker(['exec',owned('database').id,'pg_dump','-U','r5','-d','r5_synthetic','--no-owner','--no-acl']);backupDigest=digest(dump);
    // Restore to a separate DB BEFORE changing the source DB.
    docker(['exec',owned('database').id,'createdb','-U','r5','r5_restore']);
    sql('r5_restore',dump);assert.deepEqual(fingerprint('r5_restore'),backupFingerprint);
    return {restoreVerified:true,runtimeFilesPreserved:true,backupDigest,backupReference:'synthetic-in-memory'};
  },
  async migrate(ctx) {
    spec.services.backend.image=candidates.backend;
    spec.services.backend.environment.DB_AUTO_MIGRATE='false';spec.services.backend.environment.DB_RUN_SEEDS='false';
    spec.services.backend.command=['node','-e',"const db=require('./src/db');const p=db.createPool(process.env.DATABASE_URL);db.runMigrations(p).then(()=>db.verifyMigrations(p)).then(r=>{if(r.expected!==30||r.applied!==30)throw Error('migration');}).then(()=>p.end()).catch(()=>process.exit(1));"];
    compose('up','-d','--no-deps','--no-build','backend');
    assert.equal(docker(['wait',owned('backend').id]),'0');
    assert.ok(fingerprint('r5_synthetic').schema_migrations.startsWith('30:'));migrationVerified=true;
    if(failAt==='migrate')throw new Error('INJECTED_AFTER_ACTUAL_MIGRATION');
    return {historyVerified:true,seedsDisabled:true};
  },
  async switchImages(ctx) {
    spec.services.backend.command=['node','src/server.js'];spec.services.frontend.image=candidates.frontend;
    compose('up','-d','--no-deps','--wait','--wait-timeout','120','backend');
    compose('up','--no-start','--no-deps','--no-build','--force-recreate','frontend');
    assert.equal(owned('backend').info.Image,candidates.backend);assert.equal(owned('frontend').info.Image,candidates.frontend);
    assert.equal(owned('frontend').info.State.Running,false);
    if(failAt==='switchImages')throw new Error('INJECTED_AFTER_ACTUAL_IMAGE_SWITCH');
    return {imageIdsMatched:true,threeServices:true,privateDatabasePorts:true};
  },
  async verify(){throw new Error('PUBLIC_TLS_NOT_TESTED_IN_ISOLATION');},
  async release(){throw new Error('NO_PUBLIC_RELEASE_IN_REHEARSAL');},
  async postReleaseVerify(){throw new Error('NO_PUBLIC_RELEASE_IN_REHEARSAL');},
  async contain(){throw new Error('UNKNOWN_REMOTE_COMMAND_REQUIRES_RECONCILIATION');},
  async rollback(ctx,{backup,migrationAttempted}) {
    recoveryStep='FREEZE';
    await actions.freeze(ctx);
    recoveryStep='BACKUP_DIGEST';
    assert.equal(backup?.backupDigest,backupDigest);assert.equal(digest(dump),backupDigest);
    const candidateFingerprint=fingerprint('r5_synthetic');
    spec.services.backend.image=oldBackend;spec.services.backend.command=['node','src/server.js'];
    spec.services.backend.environment.DATABASE_URL=spec.services.backend.environment.DATABASE_URL.replace(/\/r5_synthetic$/,'/r5_restore');
    spec.services.backend.environment.DB_AUTO_MIGRATE='false';spec.services.backend.environment.DB_RUN_SEEDS='false';spec.services.frontend.image=oldFrontend;
    recoveryStep='START_OLD_BACKEND';
    compose('up','-d','--no-deps','--wait','--wait-timeout','120','backend');
    recoveryStep='CREATE_OLD_FRONTEND';
    compose('up','--no-start','--no-deps','--no-build','--force-recreate','frontend');
    for(const a of archives) {
      recoveryStep='RESTORE_FRONTEND_FILE';
      docker(['cp','-',`${owned('frontend').id}:/usr/share/nginx/html`],a.tar);
      recoveryStep='VERIFY_FRONTEND_ARCHIVE';
      // Same source file metadata/content preserved in the Docker cp tar receipt.
      assert.equal(digest(docker(['cp',`${owned('frontend').id}:/usr/share/nginx/html/${a.file}`,'-'],undefined,true)),digest(a.tar));
    }
    recoveryStep='VERIFY_RESTORED_DATABASE';
    assert.deepEqual(fingerprint('r5_restore'),backupFingerprint);
    recoveryStep='VERIFY_RESTORED_LOGIN';
    docker(['exec','-i',owned('backend').id,'node'],`const assert=require('node:assert/strict');(async()=>{const base='http://127.0.0.1:8080';const c=await fetch(base+'/api/auth/csrf');assert.equal(c.status,200);const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{cookie:c.headers.get('set-cookie').split(';')[0],'content-type':'application/json'},body:JSON.stringify({email:'admin@seowon.local',password:process.env.SEED_ADMIN_PASSWORD,_csrf:(await c.json()).csrfToken})});assert.equal(r.status,200);assert.ok((await r.json()).user);})().catch(()=>process.exit(1));`);
    recoveryStep='VERIFY_CANDIDATE_DATABASE_PRESERVED';
    assert.deepEqual(fingerprint('r5_synthetic'),candidateFingerprint);
    assert.equal(owned('frontend').info.State.Running,false);assert.equal(owned('backend').info.Image,oldBackend);runtimeRestored=true;
    return {ingressBlocked:true,originalRuntimeRestored:true,candidateDataPreserved:migrationAttempted,backupDigest};
  }
};
const driver=createR5MutationDriver({candidateSha:sha,actions});
try {
  compose('config','--quiet');started=true;compose('up','-d','--no-build','--wait','--wait-timeout','120');
  const instant=Date.now();
  const candidate={sha,target:project,publicUrl:'https://synthetic.invalid',ciSha:sha,ciConclusion:'success',backendImage:candidates.backend,frontendImage:candidates.frontend};
  // Synthetic approval and clock exercise the executor; neither authorizes Production.
  const approval={candidateSha:sha,target:project,publicUrl:candidate.publicUrl,window:{start:new Date(instant-1000).toISOString(),rollbackCutoff:new Date(instant+1200000).toISOString(),end:new Date(instant+1800000).toISOString()}};
  const result=await executeR5Deployment({approval,candidate,driver,execute:true});
  assert.equal(result.status,'ROLLED_BACK_TRAFFIC_HELD');assert.equal(migrationVerified,true);assert.equal(runtimeRestored,true);
  console.log(JSON.stringify({status:'PASS_ISOLATED_R5_RECOVERY',failAt,executor:result.status,migrationBefore:25,migrationAfter:30,restoredMigration:25,comparedTables:4,runtimeFiles:3,restoredLogin:'PASS',sourceDatabasePreserved:true,realDocker:true,syntheticOnly:true,productionChanged:false,mutationDriver:'BOUND_AND_VERIFIED',productionActionBinding:'NOT_IMPLEMENTED',employeeUat:'NOT_RUN'}));
} catch(error) {
  console.error(JSON.stringify({status:'FAIL_ISOLATED_R5_RECOVERY',failAt,migrationVerified,runtimeRestored,recoveryStep,errorClass:error.name}));process.exitCode=1;
} finally {
  if(started && !commandOutcomeUnknown) {
    const ids=docker(['ps','-aq','--filter',`label=com.docker.compose.project=${project}`]).split(/\s+/).filter(Boolean);
    assert.ok(ids.length<=3);
    for(const id of ids){const i=JSON.parse(docker(['inspect',id]))[0];assert.equal(i.Config.Labels['com.docker.compose.project'],project);assert.ok(Object.hasOwn(spec.services,i.Config.Labels['com.docker.compose.service']));assert.ok(i.Mounts.every(m=>m.Type==='tmpfs'));}
    if(ids.length)compose('down','--timeout','10');
  }
  if(commandOutcomeUnknown)console.error(JSON.stringify({status:'HOLD_COMMAND_OUTCOME_UNKNOWN',preservedSyntheticProject:project,cleanup:'NOT_RUN'}));
}
