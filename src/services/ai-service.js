const { DomainError, positiveInteger } = require('./inventory-service');
const AI_CONTRACT = Object.freeze({ provider: 'rules-and-adapters', modelVersion: 'cost-control-v1' });
const AI_ACTIONS = new Set(['TRANSFER','REPAIR','REPLACE','HOLD']);
const AI_DECISIONS = new Set(['ACCEPTED','REJECTED','EXECUTED','NOT_USEFUL']);
function organization(user, value) { const id=positiveInteger(value || user?.organizationId,'조직'); if(!user?.isSystemAdmin&&Number(user?.organizationId)!==id) throw new DomainError('다른 조직의 AI 데이터에 접근할 수 없습니다.',403); return id; }
function safeText(value,max=200) { return String(value||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max); }
async function recommendActions(pool,user,input={},scope={},provider=null) {
  const organizationId=organization(user,input.organizationId); const values=[organizationId]; const where=['a.organization_id=$1',"a.status_code IN ('AVAILABLE','RETURNED','REPAIR')"];
  if(scope.departmentIds?.length){values.push(scope.departmentIds);where.push(`a.department_id=ANY($${values.length}::bigint[])`);} if(input.assetId){values.push(positiveInteger(input.assetId,'자산'));where.push(`a.id=$${values.length}`);} if(input.q){values.push(`%${safeText(input.q)}%`);where.push(`(a.name ILIKE $${values.length} OR a.asset_tag ILIKE $${values.length})`);}
  const rows=await pool.query(`SELECT a.id,a.asset_tag,a.name,a.status_code,a.acquisition_cost,a.location_id,a.department_id,COALESCE((SELECT sum(s.cost) FROM service_tickets s WHERE s.asset_id=a.id AND s.organization_id=a.organization_id),0)::numeric repair_cost,COALESCE((SELECT sum(e.amount) FROM asset_cost_events e WHERE e.asset_id=a.id AND e.organization_id=a.organization_id AND e.event_type='TRANSFER'),0)::numeric transfer_cost FROM assets a WHERE ${where.join(' AND ')} ORDER BY a.status_code='AVAILABLE' DESC,a.acquisition_cost DESC LIMIT 50`,values);
  if (provider && typeof provider.recommend === 'function') {
    const external = await provider.recommend({ organizationId, query: input, assets: rows.rows.map(row => ({ ...row, repair_cost: Number(row.repair_cost || 0), transfer_cost: Number(row.transfer_cost || 0) })) });
    const allowed = new Map(rows.rows.map(row => [Number(row.id), row]));
    const recommendations = (Array.isArray(external?.recommendations) ? external.recommendations : []).filter(row => allowed.has(Number(row.assetId)) && AI_ACTIONS.has(String(row.actionType || '').toUpperCase())).map(row => ({
      ...row,
      assetId: Number(row.assetId),
      assetTag: allowed.get(Number(row.assetId)).asset_tag,
      actionType: String(row.actionType).toUpperCase(),
      estimatedCost: Math.max(0, Number(row.estimatedCost || 0)),
      avoidedCost: Math.max(0, Number(row.avoidedCost || 0)),
      confidence: Math.min(1, Math.max(0, Number(row.confidence || 0))),
      evidence: Array.isArray(row.evidence) ? row.evidence.slice(0, 10).map(value => safeText(value, 300)) : []
    }));
    const usage = external?.usage && typeof external.usage === 'object' ? {
      promptTokens: Number(external.usage.prompt_tokens || external.usage.promptTokens || 0),
      completionTokens: Number(external.usage.completion_tokens || external.usage.completionTokens || 0),
      totalTokens: Number(external.usage.total_tokens || external.usage.totalTokens || 0)
    } : null;
    return {
      organizationId,
      provider: safeText(external?.provider || provider.name || 'external', 80) || 'external',
      modelVersion: safeText(external?.modelVersion || provider.modelVersion || 'external', 80) || 'external',
      usage,
      recommendations: recommendations.slice(0,20)
    };
  }
  const purchaseCost=Math.max(0,Number(input.estimatedPurchaseCost||0)); const recommendations=[];
  for(const row of rows.rows){ if(row.status_code!=='REPAIR'&&Number(row.acquisition_cost||0)>0) recommendations.push({actionType:'TRANSFER',assetId:row.id,assetTag:row.asset_tag,estimatedCost:Number(row.transfer_cost||0),avoidedCost:purchaseCost||Number(row.acquisition_cost||0),confidence:.78,evidence:[`동일 조직 자산 ${row.asset_tag}`,`상태 ${row.status_code}`,'자산 원장·이동 비용 이벤트']}); if(row.status_code==='REPAIR') recommendations.push({actionType:'REPAIR',assetId:row.id,assetTag:row.asset_tag,estimatedCost:Number(row.repair_cost||0),avoidedCost:purchaseCost||Number(row.acquisition_cost||0),confidence:.66,evidence:[`수리 원장 ${Number(row.repair_cost||0).toLocaleString()}원`,'수리 티켓 비용']}); if(purchaseCost>0) recommendations.push({actionType:'REPLACE',assetId:row.id,assetTag:row.asset_tag,estimatedCost:purchaseCost,avoidedCost:0,confidence:.41,evidence:['사용자 입력 예상 구매비용','교체는 승인 후 실행']}); }
  return {organizationId,provider:AI_CONTRACT.provider,modelVersion:AI_CONTRACT.modelVersion,recommendations:recommendations.sort((a,b)=>Number(b.avoidedCost||0)-Number(a.avoidedCost||0)).slice(0,20)};
}
function parseSearch(input={}) { const text=safeText(input.q,120).toLowerCase(); const filters={}; if(/(유휴|idle)/i.test(text)) filters.idle=true; if(/(수리|repair)/i.test(text)) filters.status='REPAIR'; if(/(사용|배정|in.?use)/i.test(text)) filters.status='IN_USE'; const tag=text.match(/[a-z]{2,5}(?:-[a-z]{2,5})?-\d{2,}/i)?.[0]; if(tag) filters.q=tag; return {intent:'asset_search',filters,normalizedQuery:text}; }
async function searchAssets(pool,user,input={},scope={}) { const organizationId=organization(user,input.organizationId); const intent=parseSearch(input); const values=[organizationId]; const where=['a.organization_id=$1']; if(intent.filters.status){values.push(intent.filters.status);where.push(`a.status_code=$${values.length}`);} if(intent.filters.q){values.push(`%${intent.filters.q}%`);where.push(`(a.asset_tag ILIKE $${values.length} OR a.name ILIKE $${values.length})`);} if(intent.filters.idle) where.push(`a.status_code IN ('AVAILABLE','RETURNED') AND NOT EXISTS(SELECT 1 FROM asset_assignments aa WHERE aa.asset_id=a.id AND aa.status='ACTIVE' AND aa.ended_at IS NULL)`); if(scope.departmentIds?.length){values.push(scope.departmentIds);where.push(`a.department_id=ANY($${values.length}::bigint[])`);} const result=await pool.query(`SELECT a.id,a.asset_tag,a.name,a.status_code,a.acquisition_cost,l.name location_name FROM assets a LEFT JOIN locations l ON l.id=a.location_id AND l.organization_id=a.organization_id WHERE ${where.join(' AND ')} ORDER BY a.updated_at DESC LIMIT 50`,values); return {organizationId,intent,results:result.rows}; }
async function detectAnomalies(pool,user,input={},scope={}) { const organizationId=organization(user,input.organizationId); const values=[organizationId]; const scopeSql=scope.departmentIds?.length?(values.push(scope.departmentIds),` AND a.department_id=ANY($${values.length}::bigint[])`):''; const result=await pool.query(`WITH costs AS (SELECT a.id,a.asset_tag,a.name,a.acquisition_cost,COALESCE(sum(s.cost),0)::numeric repair_cost FROM assets a LEFT JOIN service_tickets s ON s.asset_id=a.id AND s.organization_id=a.organization_id WHERE a.organization_id=$1${scopeSql} GROUP BY a.id) SELECT *,CASE WHEN acquisition_cost>0 AND repair_cost>acquisition_cost*0.5 THEN 'REPAIR_COST_RATIO' WHEN repair_cost>0 AND repair_cost>1000000 THEN 'HIGH_REPAIR_COST' END anomaly_type FROM costs WHERE (acquisition_cost>0 AND repair_cost>acquisition_cost*0.5) OR repair_cost>1000000 ORDER BY repair_cost DESC LIMIT 50`,values); return {organizationId,provider:AI_CONTRACT.provider,modelVersion:AI_CONTRACT.modelVersion,anomalies:result.rows.map(row=>({...row,severity:'WARNING',score:Number(row.repair_cost||0)/Math.max(1,Number(row.acquisition_cost||1))}))}; }
async function extractDocument({provider,organizationId,assetId,fileId,input}) { if(!provider||typeof provider.extract!=='function') return {status:'NOT_CONFIGURED',provider:'none',modelVersion:'none',fields:{},confidence:{}}; const result=await provider.extract({organizationId,assetId,fileId,text:safeText(input?.text,10000)}); return {status:'COMPLETED',provider:provider.name||'external',modelVersion:provider.modelVersion||'unknown',fields:result.fields||{},confidence:result.confidence||{}}; }
function normalizeFeedback(input = {}) {
  const actionType = String(input.actionType || '').trim().toUpperCase();
  const decision = String(input.decision || '').trim().toUpperCase();
  const reason = safeText(input.reason, 1000);
  if (!AI_ACTIONS.has(actionType)) throw new DomainError('올바른 AI 행동 유형이 필요합니다.');
  if (!AI_DECISIONS.has(decision)) throw new DomainError('올바른 AI 피드백 결정이 필요합니다.');
  if (reason.length < 2) throw new DomainError('AI 피드백 사유는 2자 이상이어야 합니다.');
  const number = (value, label) => value == null || value === '' ? null : (() => { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw new DomainError(`${label}은(는) 0 이상 숫자여야 합니다.`); return parsed; })();
  const confidence = number(input.confidence, '신뢰도');
  if (confidence != null && confidence > 1) throw new DomainError('신뢰도는 0~1 범위여야 합니다.');
  return { actionType, decision, reason, provider: safeText(input.provider || AI_CONTRACT.provider, 80) || AI_CONTRACT.provider, modelVersion: safeText(input.modelVersion || AI_CONTRACT.modelVersion, 80) || AI_CONTRACT.modelVersion, estimatedCost: number(input.estimatedCost, '예상 비용'), avoidedCost: number(input.avoidedCost, '회피 비용'), confidence };
}
function normalizeEvaluation(input = {}) {
  const datasetVersion = safeText(input.datasetVersion, 80); const provider = safeText(input.provider, 80); const modelVersion = safeText(input.modelVersion, 80); const sampleCount = Number(input.sampleCount);
  if (!datasetVersion || !provider || !modelVersion) throw new DomainError('평가 데이터셋·공급자·모델 버전이 필요합니다.');
  if (!Number.isInteger(sampleCount) || sampleCount < 0) throw new DomainError('평가 표본 수는 0 이상의 정수여야 합니다.');
  const score = (value, label) => value == null || value === '' ? null : (() => { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new DomainError(`${label}은(는) 0~1 범위여야 합니다.`); return parsed; })();
  const status = String(input.status || 'DRAFT').toUpperCase(); if (!['DRAFT','PASSED','FAILED'].includes(status)) throw new DomainError('올바른 평가 상태가 필요합니다.');
  return { datasetVersion, provider, modelVersion, sampleCount, precision: score(input.precision, '정밀도'), recall: score(input.recall, '재현율'), costPerRequest: input.costPerRequest == null || input.costPerRequest === '' ? null : Number(input.costPerRequest), status, metrics: input.metrics && typeof input.metrics === 'object' ? input.metrics : {} };
}
module.exports={AI_CONTRACT,organization,parseSearch,recommendActions,searchAssets,detectAnomalies,extractDocument,normalizeFeedback,normalizeEvaluation};
