// Startup-only maintenance switch: freeze before starting the HTTP server.
// This is not an authorization bypass or a substitute for ingress/DB quiescence.
function startBackgroundWorkers({config,pool,eventPublisher,publishBatch,createAutomationScheduler,
  setInterval=global.setInterval,clearInterval=global.clearInterval,logger=console}) {
  if(config.backgroundWorkersEnabled===false)return {enabled:false,stop(){}};
  let publishing=false;
  const timer=eventPublisher?setInterval(async()=>{
    if(publishing)return;
    publishing=true;
    try {
      const results=await publishBatch(pool,eventPublisher,config.outboxBatchSize);
      if(results.length)logger.log(JSON.stringify({event:'outbox_batch',results}));
    } catch {
      logger.error(JSON.stringify({event:'outbox_publish_error',code:'OUTBOX_PUBLISH_FAILED'}));
    } finally {publishing=false;}
  },config.outboxPollIntervalMs):null;
  const scheduler=config.automationWorkerEnabled?createAutomationScheduler({pool,intervalMs:config.automationWorkerIntervalMs}):null;
  return {enabled:true,stop(){if(timer!==null)clearInterval(timer);scheduler?.stop();}};
}
module.exports={startBackgroundWorkers};
