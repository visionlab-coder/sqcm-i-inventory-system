import { randomUUID } from 'node:crypto';

export const R5_STEPS = Object.freeze(['freeze', 'backup', 'migrate', 'switchImages', 'verify']);
const required = {
  freeze: ['ingressBlocked', 'workersStopped', 'activeWritesZero'],
  backup: ['restoreVerified', 'runtimeFilesPreserved'],
  migrate: ['historyVerified', 'seedsDisabled'],
  switchImages: ['imageIdsMatched', 'threeServices', 'privateDatabasePorts'],
  verify: ['health', 'authenticatedSmoke', 'database', 'tls']
};
function validateInput({approval, candidate, now}) {
  if (!approval || !candidate || !/^[a-f0-9]{40}$/.test(candidate.sha || '')) throw new Error('R5_INVALID_CANDIDATE');
  if (approval.candidateSha !== candidate.sha || approval.target !== candidate.target || approval.publicUrl !== candidate.publicUrl) throw new Error('R5_APPROVAL_TARGET_MISMATCH');
  if (candidate.ciSha !== candidate.sha || candidate.ciConclusion !== 'success') throw new Error('R5_CI_NOT_BOUND');
  if (![candidate.backendImage, candidate.frontendImage].every(id => /^sha256:[a-f0-9]{64}$/.test(id || ''))) throw new Error('R5_IMAGE_ID_INVALID');
  const times = ['start','rollbackCutoff','end'].map(key => Date.parse(approval.window?.[key]));
  if (!times.every(Number.isFinite) || !(times[0]<times[1] && times[1]<times[2])) throw new Error('R5_INVALID_WINDOW');
  const current=now();
  if (!Number.isFinite(current) || current<times[0] || current>=times[1]) throw new Error('R5_OUTSIDE_EXECUTION_WINDOW');
  return times;
}

// Driver owns real commands and their bounded timeouts; no subprocess is detached.
// Do not use Promise.race to start recovery while a timed-out mutation is still running.
export async function executeR5Deployment({approval, candidate, driver, now=Date.now, execute=false}={}) {
  const times=validateInput({approval,candidate,now});
  if (!execute) return {status:'READY_DRY_RUN',candidateSha:candidate.sha,steps:R5_STEPS,externalMutationPerformed:false};
  const methods=[...R5_STEPS,'rollback','release','postReleaseVerify','contain'];
  if (!driver || methods.some(step => typeof driver[step]!=='function')) throw new Error('R5_DRIVER_INCOMPLETE');
  const context=Object.freeze({runId:randomUUID(),candidate:Object.freeze({...candidate}),rollbackCutoff:times[1],windowEnd:times[2]});
  const receipts=[];
  let freezeAttempted=false;
  let backup;
  let migrationAttempted=false;
  let releaseAttempted=false;
  let stage='freeze';
  const assertBeforeCutoff=()=> {
    const current=now();
    if(!Number.isFinite(current) || current<times[0] || current>=times[1]) throw new Error('R5_CUTOFF_REACHED');
  };
  try {
    for (stage of R5_STEPS) {
      assertBeforeCutoff();
      if(stage==='freeze') freezeAttempted=true;
      if(stage==='migrate') migrationAttempted=true;
      const receipt=await driver[stage](context,backup);
      if (!receipt || receipt.runId!==context.runId || receipt.candidateSha!==candidate.sha || required[stage].some(key=>receipt[key]!==true)) throw new Error('R5_RECEIPT_INVALID');
      if(stage==='backup') {
        if(!/^sha256:[a-f0-9]{64}$/.test(receipt.backupDigest || '') || !receipt.backupReference) throw new Error('R5_BACKUP_NOT_BOUND');
        backup=receipt;
      }
      // Only allowlisted booleans are public; no driver text, paths, credentials or payloads.
      receipts.push({stage,verified:true});
    }
    assertBeforeCutoff();
    stage='release';releaseAttempted=true;
    const receipt=await driver.release(context,backup);
    if(!receipt || receipt.runId!==context.runId || receipt.candidateSha!==candidate.sha || receipt.writesEnabled!==true) throw new Error('R5_RELEASE_UNCERTAIN');
    stage='postReleaseVerify';
    const publicReceipt=await driver.postReleaseVerify(context,backup);
    if(!publicReceipt || publicReceipt.runId!==context.runId || publicReceipt.candidateSha!==candidate.sha
      || publicReceipt.publicHttps!==true || publicReceipt.authenticatedSmoke!==true || publicReceipt.database!==true) {
      throw new Error('R5_PUBLIC_VERIFICATION_FAILED');
    }
    assertBeforeCutoff();
    receipts.push({stage:'postReleaseVerify',verified:true});
    return {status:'DEPLOYED_UAT_PENDING',candidateSha:candidate.sha,receipts,externalMutationPerformed:true,employeeUat:'NOT_RUN'};
  } catch (error) {
    if(releaseAttempted || error?.code==='R5_COMMAND_OUTCOME_UNKNOWN') {
      // Writes may already have been accepted. Never restore an old DB automatically.
      let containmentVerified=false;
      try {
        const held=await driver.contain(context);
        containmentVerified=held?.runId===context.runId && held?.candidateSha===candidate.sha && held?.ingressBlocked===true && held?.workersStopped===true && held?.activeWritesZero===true && held?.candidateDataPreserved===true;
      } catch { /* Unknown state stays unverified, without exposing driver errors. */ }
      return {status:releaseAttempted?'HOLD_RELEASE_UNCERTAIN_RECONCILIATION_REQUIRED':'HOLD_COMMAND_OUTCOME_UNKNOWN',failedStage:stage,receipts,externalMutationPerformed:true,automaticDatabaseRestore:false,containmentVerified};
    }
    if(!freezeAttempted) return {status:'HOLD_BEFORE_MUTATION',failedStage:stage,receipts,externalMutationPerformed:false};
    try {
      const restored=await driver.rollback(context,{backup,migrationAttempted});
      if (!restored || restored.runId!==context.runId || restored.candidateSha!==candidate.sha || restored.ingressBlocked!==true || restored.originalRuntimeRestored!==true || (migrationAttempted && (restored.candidateDataPreserved!==true || restored.backupDigest!==backup?.backupDigest))) throw new Error('R5_RECOVERY_NOT_VERIFIED');
      return {status:'ROLLED_BACK_TRAFFIC_HELD',failedStage:stage,receipts,externalMutationPerformed:true};
    } catch {
      return {status:'HOLD_RECOVERY_UNVERIFIED',failedStage:stage,receipts,externalMutationPerformed:true};
    }
  }
}
