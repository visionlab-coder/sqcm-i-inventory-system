const REQUIRED_ACTIONS=Object.freeze(['freeze','backup','migrate','switchImages','verify','release','postReleaseVerify','contain','rollback']);
const REQUIRED_OBSERVATIONS=Object.freeze({
  freeze:['ingressBlocked','workersStopped','activeWritesZero'],
  backup:['restoreVerified','runtimeFilesPreserved'],
  migrate:['historyVerified','seedsDisabled'],
  switchImages:['imageIdsMatched','threeServices','privateDatabasePorts'],
  verify:['health','authenticatedSmoke','database','tls'],
  release:['writesEnabled'],
  postReleaseVerify:['publicHttps','authenticatedSmoke','database'],
  contain:['ingressBlocked','workersStopped','activeWritesZero','candidateDataPreserved'],
  rollback:['ingressBlocked','originalRuntimeRestored']
});

export function createR5MutationDriver({candidateSha,actions}={}) {
  if(!/^[a-f0-9]{40}$/.test(candidateSha || '') || !actions || REQUIRED_ACTIONS.some(name=>typeof actions[name]!=='function')) throw new Error('R5_MUTATION_ACTIONS_INVALID');
  return Object.fromEntries(REQUIRED_ACTIONS.map(name=>[name,async(context,...args)=>{
    if(context?.candidate?.sha!==candidateSha || !/^[a-f0-9-]{32,36}$/i.test(context?.runId || '')) throw new Error('R5_MUTATION_CONTEXT_INVALID');
    const observation=await actions[name](context,...args);
    if(!observation || typeof observation!=='object' || REQUIRED_OBSERVATIONS[name].some(key=>observation[key]!==true)) throw new Error(`R5_${name.toUpperCase()}_OBSERVATION_INVALID`);
    if(name==='backup' && (!/^sha256:[a-f0-9]{64}$/.test(observation.backupDigest || '') || typeof observation.backupReference!=='string' || !observation.backupReference)) throw new Error('R5_BACKUP_OBSERVATION_NOT_BOUND');
    if(name==='rollback' && args[0]?.migrationAttempted===true && (!observation.candidateDataPreserved || observation.backupDigest!==args[0]?.backup?.backupDigest)) throw new Error('R5_ROLLBACK_DATA_PRESERVATION_INVALID');
    return {runId:context.runId,candidateSha,...observation};
  }]));
}
