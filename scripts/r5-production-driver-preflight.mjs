// Read-only production observation. This script never invokes compose up/stop,
// database DDL/DML, file copy, ingress, worker or Secret mutation commands.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateR5ProductionDriverPreflight, R5_RUNTIME_PRESERVE_PATHS } from '../src/operations/r5-production-driver-preflight.mjs';
import { inspectProductionUatJsonReference, readProductionUatJsonDocument } from '../src/operations/production-uat-input-reader.mjs';
import { validateRoleCredential } from '../src/operations/production-role-core-smoke.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtimeRoot='D:\\seowon_runtime\\sqcm-i-inventory-production';
const backupPath=path.join(runtimeRoot,'backups','r5-protected-469a0c0');
const project='seowon-inventory-production';
const candidateEvidence=JSON.parse(fs.readFileSync(path.join(root,'agent docs','harness','R5_WORKER_FREEZE_CANDIDATE.json'),'utf8'));
const approval=JSON.parse(fs.readFileSync(path.join(root,'agent docs','harness','R5_ACTIVE_DEPLOYMENT_APPROVAL.json'),'utf8'));
const sha=candidateEvidence.candidateSha;

function command(program,args,{input}={}) {
  const result=spawnSync(program,args,{input,encoding:'utf8',windowsHide:true,timeout:30_000,maxBuffer:8*1024*1024});
  if(result.error?.code==='ETIMEDOUT') throw new Error('R5_PREFLIGHT_COMMAND_TIMEOUT');
  if(result.error || result.status!==0) {
    const operation=program==='docker' ? String(args[0]).replaceAll('-','_').toUpperCase() : 'ACL';
    throw new Error(`R5_PREFLIGHT_${operation}_COMMAND_FAILED`);
  }
  return result.stdout.trim();
}
function inspectImage(tag) {
  const value=JSON.parse(command('docker',['image','inspect',tag]))[0];
  return {id:value.Id,revision:value.Config?.Labels?.['org.opencontainers.image.revision'] ?? null};
}
function inspectContainers() {
  const ids=command('docker',['ps','-aq','--filter',`label=com.docker.compose.project=${project}`]).split(/\s+/).filter(Boolean);
  return ids.map(id=>JSON.parse(command('docker',['inspect',id]))[0]);
}
function publishedPorts(info) {
  const values=[];
  for(const bindings of Object.values(info.HostConfig?.PortBindings ?? {})) for(const binding of bindings ?? []) values.push(`${binding.HostIp}:${binding.HostPort}`);
  return values.sort();
}
function runtimeChanges(containers) {
  const required=new Set(R5_RUNTIME_PRESERVE_PATHS);
  const observed=new Set();
  const unexpected=[];
  let protectedDatabaseBackupCount=0;
  const ignored=[
    /^frontend:\/(usr|usr\/share|usr\/share\/nginx|usr\/share\/nginx\/html|etc|etc\/nginx|etc\/nginx\/conf.d|run|run\/nginx\.pid|var|var\/cache|var\/cache\/nginx)(\/.*_temp)?$/,
    /^backend:\/(app|app\/src|run|run\/secrets)$/,
    /^database:\/(run|run\/postgresql|run\/postgresql\/\.s\.PGSQL\.5432(?:\.lock)?|tmp)$/
  ];
  for(const info of containers) {
    const service=info.Config?.Labels?.['com.docker.compose.service'];
    const lines=command('docker',['diff',info.Id]).split(/\r?\n/).filter(Boolean);
    for(const line of lines) {
      const item=`${service}:${line.slice(2)}`;
      if(required.has(item)) observed.add(item);
      else if(/^database:\/tmp\/pre-[a-z0-9-]+\.dump$/i.test(item)) { observed.add(item);protectedDatabaseBackupCount+=1; }
      else if(!ignored.some(pattern=>pattern.test(item))) unexpected.push(item);
    }
  }
  return {observed:[...observed],unexpected,protectedDatabaseBackupCount};
}
function inspectAcl() {
  const stat=fs.lstatSync(backupPath);
  const physical=stat.isDirectory() && !stat.isSymbolicLink() && path.resolve(fs.realpathSync(backupPath)).toLowerCase()===path.resolve(backupPath).toLowerCase();
  const source=command('icacls',[backupPath]);
  const rules=source.split(/\r?\n/).filter(line=>/:\([^\r\n]+\)/.test(line)).map(line=>{
    const match=line.match(/([^\s][^:]*):((?:\([^)]*\))+)/);
    return match ? {Identity:match[1].trim().replace(/^.*?\s+(?=(?:NT AUTHORITY|BUILTIN|[^\\]+\\))/i,''),Rights:match[2],Type:'Allow'} : null;
  }).filter(Boolean);
  const currentSuffix=`\\${process.env.USERNAME}`.toUpperCase();
  const current=rules.find(rule=>rule.Identity.toUpperCase().endsWith(currentSuffix))?.Identity ?? '';
  return {Physical:physical,Protected:!rules.some(rule=>rule.Rights.includes('(I)')),Current:current,Rules:rules};
}
function fullControl(rule) { return rule.Type==='Allow' && (rule.Rights==='FullControl' || rule.Rights.includes('(F)')); }
function credentials() {
  const out={};
  for(const role of ['ADMIN','MANAGER','USER']) {
    const reference=path.join(runtimeRoot,'secrets',`production-uat-${role.toLowerCase()}-credential.json`);
    const inspected=inspectProductionUatJsonReference(reference,{repositoryRoot:root});
    out[role]=inspected.present && validateRoleCredential(readProductionUatJsonDocument(reference,{repositoryRoot:root}).value);
  }
  return out;
}

try {
  const containers=inspectContainers();
  const byService=Object.fromEntries(containers.map(info=>[info.Config?.Labels?.['com.docker.compose.service'],info]));
  const changes=runtimeChanges(containers);
  const acl=inspectAcl();
  const rules=acl.Rules ?? [];
  const system=rules.find(rule=>rule.Identity.toUpperCase()==='NT AUTHORITY\\SYSTEM');
  const administrators=rules.find(rule=>/\\ADMINISTRATORS$/i.test(rule.Identity));
  const current=rules.find(rule=>rule.Identity.toUpperCase()===String(acl.Current).toUpperCase());
  const backendCandidate=inspectImage(`sqcm-r4-backend:sha-${sha}`);
  const frontendCandidate=inspectImage(`sqcm-r4-frontend:sha-${sha}`);
  const database=byService.database;
  const activeClientWrites=Number(command('docker',['exec',database.Id,'psql','-X','-A','-t','-U','seowon','-d','seowon_inventory','-c',"SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state='active' AND xact_start IS NOT NULL;"]));
  const candidate={sha,target:approval.target,publicUrl:approval.publicUrl,backendImage:candidateEvidence.backendImage,frontendImage:candidateEvidence.frontendImage};
  const result=evaluateR5ProductionDriverPreflight({
    approval,candidate,now:Date.now(),
    runtime:{composeProject:project,activeClientWrites,candidateBackendImageId:backendCandidate.id,candidateFrontendImageId:frontendCandidate.id,candidateBackendRevision:backendCandidate.revision,candidateFrontendRevision:frontendCandidate.revision,services:Object.entries(byService).map(([name,info])=>({name,running:info.State?.Running===true,healthy:info.State?.Health?.Status==='healthy',publishedPorts:publishedPorts(info)}))},
    backup:{physicalDirectory:acl.Physical===true,reparsePoint:acl.Physical!==true,inheritanceDisabled:acl.Protected===true,currentUserFullControl:fullControl(current ?? {}),systemFullControl:fullControl(system ?? {}),administratorsFullControl:fullControl(administrators ?? {}),unexpectedPrincipalCount:rules.filter(rule=>![system,administrators,current].includes(rule)).length,runtimePreservePaths:changes.observed,unexpectedRuntimeChanges:changes.unexpected},
    credentials:credentials()
  });
  console.log(JSON.stringify({...result,candidateSha:sha,serviceCount:containers.length,runtimePreservePathCount:changes.observed.length,protectedDatabaseBackupCount:changes.protectedDatabaseBackupCount,backupAclRuleCount:rules.length,productionChanged:false},null,2));
  if(result.failures.length) process.exitCode=1;
} catch(error) {
  const code=/^R5_[A-Z0-9_]+$/.test(error?.message ?? '')?error.message:'R5_PREFLIGHT_FAILED';
  console.error(JSON.stringify({status:'BLOCKED_R5_PRODUCTION_DRIVER_PREFLIGHT',failures:[code],externalMutationPerformed:false,secretValuesReadOrRecorded:false,productionChanged:false},null,2));
  process.exitCode=1;
}
