function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*ratio)-1))];
}

function isAllowedTarget(value, allowRemote = false) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return allowRemote || ['localhost','127.0.0.1','::1'].includes(host) || host.endsWith('.test') || host.endsWith('.internal');
  } catch { return false; }
}

function evaluateLoad(samples,{maxP95Ms=1000,maxErrorRate=0}={}) {
  const errors=samples.filter(sample=>!sample.ok).length;
  const result={requests:samples.length,errors,errorRate:samples.length?errors/samples.length:1,p95Ms:percentile(samples.map(sample=>sample.durationMs),0.95)};
  return {...result,ok:result.errorRate<=maxErrorRate&&result.p95Ms<=maxP95Ms,limits:{maxP95Ms,maxErrorRate}};
}

module.exports={evaluateLoad,isAllowedTarget,percentile};
