const express = require('express');
const { DomainError, positiveInteger } = require('./services/inventory-service');
const { requirePermission, requireOrganization, createAsset, changeAssetStatus, createRequest, transitionRequest, createPurchaseOrder, createReceipt, inspectReceipt } = require('./services/enterprise-service');
const { getAssetReport, getReportAssets, getAssetDashboard } = require('./services/reporting-service');
const { createOrganizationUnit, createInvitation, revokeInvitation } = require('./services/organization-service');
const { getOperationalReferences, getAdminReferences, createReference, updateReference } = require('./services/reference-service');
const { auditTrace } = require('./observability');
const { uploadAssetFile, getAssetFile, deactivateAssetFile } = require('./services/file-service');
const { resolveScope, canAccessDepartment } = require('./services/scope-service');
const { createApprovalPolicy, listApprovalPolicies } = require('./services/approval-service');
const { uploadReturnPhoto } = require('./services/return-service');
const { getCostCommandCenter, getCostRoiSummary, recordSavingsEvent } = require('./services/cost-service');
const { recommendActions, searchAssets, detectAnomalies, extractDocument, normalizeFeedback, normalizeEvaluation } = require('./services/ai-service');
const { analyzeAssetImport, commitAssetImport, safeSpreadsheetCsvCell, assetImportTemplate } = require('./services/asset-import-service');
const { createIdempotencyMiddleware } = require('./idempotency');
const QRCode = require('qrcode');
const { findAssetByQr, findAssetForQrLabel, qrScanUrl } = require('./services/asset-qr-service');
const { normalizeOfflineBatch } = require('./services/stocktake-offline-service');

const page = req => ({ size: Math.min(100, Math.max(1, Number(req.query.size) || 25)), offset: Math.max(0, Number(req.query.page) || 0) * Math.min(100, Math.max(1, Number(req.query.size) || 25)) });
const trace = req => ({ ...auditTrace(req), idempotencyKey: String(req.get('idempotency-key') || '').slice(0, 100) || null });
const orgId = (req, value) => requireOrganization(req.user, value || req.user.organizationId);

async function audit(pool, req, action, type, id, metadata = {}) {
  const current = auditTrace(req);
  await pool.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)`, [req.user.id, action, type, String(id), JSON.stringify(metadata), current.requestId, current.ip]);
}

function createEnterpriseRouter({ pool, apiAuth, requireRecentReauth, isProduction = false, publicBaseUrl = '', fileStore, malwareScanner, fileMaxBytes = 5 * 1024 * 1024, aiProvider }) {
  const router = express.Router();
  const idempotency = createIdempotencyMiddleware({ pool, required: isProduction });
  router.use(apiAuth);
  router.use((req, res, next) => {
    const contentType = String(req.get('content-type') || '').toLowerCase();
    if (contentType.startsWith('image/') || contentType.startsWith('application/pdf') || contentType.startsWith('text/csv') || contentType.startsWith('application/csv')) return next();
    idempotency(req, res, next);
  });
  router.use((req, res, next) => {
    if (req.path.startsWith('/admin/') && req.method !== 'GET') return requireRecentReauth(req, res, next);
    next();
  });

  router.get('/reference', async (req, res) => {
    const data=await getOperationalReferences(pool,req.user,req.query.organizationId); const scope=await resolveScope(pool,req.user);
    if(scope.departmentIds){data.departments=data.departments.filter(row=>scope.departmentIds.includes(Number(row.id)));data.users=data.users.filter(row=>scope.departmentIds.includes(Number(row.department_id)));}
    res.json({...data,scope});
  });

  router.get('/assets', async (req, res) => {
    requirePermission(req.user, 'asset.read');
    const organizationId = orgId(req, req.query.organizationId); const paging = page(req);
    const scope=await resolveScope(pool,req.user);
    const q = String(req.query.q || '').trim(); const status = String(req.query.status || '').trim().toUpperCase();
    const values = [organizationId]; const where = ['a.organization_id=$1'];
    if(scope.departmentIds){values.push(scope.departmentIds);where.push(`a.department_id=ANY($${values.length}::bigint[])`);}
    if (q) { values.push(`%${q}%`); where.push(`(a.asset_tag ILIKE $${values.length} OR a.name ILIKE $${values.length} OR a.serial_no ILIKE $${values.length})`); }
    if (status) { values.push(status); where.push(`a.status_code=$${values.length}`); }
    for (const [queryKey, column] of [['departmentId','a.department_id'],['locationId','a.location_id'],['categoryId','a.category_id']]) {
      if (req.query[queryKey]) { values.push(positiveInteger(req.query[queryKey], queryKey)); where.push(`${column}=$${values.length}`); }
    }
    if (req.query.acquiredFrom) { values.push(req.query.acquiredFrom); where.push(`a.acquired_at >= $${values.length}::date`); }
    if (req.query.acquiredTo) { values.push(req.query.acquiredTo); where.push(`a.acquired_at <= $${values.length}::date`); }
    values.push(paging.size, paging.offset);
    const result = await pool.query(`SELECT a.*,l.name location_name,d.name department_name,c.name category_name,
      count(*) OVER()::int total_count FROM assets a LEFT JOIN locations l ON l.id=a.location_id LEFT JOIN departments d ON d.id=a.department_id
      LEFT JOIN item_categories c ON c.id=a.category_id WHERE ${where.join(' AND ')} ORDER BY a.updated_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    res.json({ assets: result.rows, page: paging.offset / paging.size, size: paging.size, total: result.rows[0]?.total_count || 0 });
  });

  router.get('/dashboard', async (req, res) => {
    requirePermission(req.user, 'asset.read');
    const organizationId = orgId(req, req.query.organizationId);
    const scope = await resolveScope(pool, req.user);
    res.json(await getAssetDashboard(pool, organizationId, req.user, scope));
  });

  const rawAssetCsv = express.text({ type: ['text/csv', 'application/csv'], limit: '512kb' });
  router.get('/assets/import/template.csv', (req, res) => {
    requirePermission(req.user, 'asset.create');
    res.set({
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="sqcm-i-asset-import-template.csv"',
      'cache-control': 'no-store'
    }).send(`\ufeff${assetImportTemplate()}`);
  });
  router.post('/assets/import/preview', rawAssetCsv, idempotency, async (req, res) => {
    const preview = await analyzeAssetImport(pool, req.user, req.body);
    res.set('cache-control', 'no-store').json({ preview });
  });
  router.post('/assets/import/commit', rawAssetCsv, idempotency, async (req, res) => {
    const result = await commitAssetImport(pool, req.user, req.body, String(req.get('x-import-checksum') || ''), trace(req));
    res.status(201).json({ result });
  });

  router.post('/assets', async (req, res) => res.status(201).json({ asset: await createAsset(pool, req.user, req.body, trace(req)) }));
  const rawEvidence = express.raw({ type: ['image/jpeg','image/png','application/pdf'], limit: fileMaxBytes });
  router.post('/assets/:id/files', rawEvidence, idempotency, async (req,res) => {
    const file = await uploadAssetFile({ pool,fileStore,malwareScanner,maxBytes:fileMaxBytes,user:req.user,assetId:req.params.id,
      input:{ content:req.body,contentType:req.get('content-type'),originalName:req.get('x-file-name'),fileType:req.get('x-file-type') },trace:auditTrace(req) });
    res.status(201).json({ file:{ id:file.id,originalName:file.original_name,contentType:file.content_type,checksum:file.checksum,sizeBytes:Number(file.size_bytes),status:file.status } });
  });
  router.get('/assets/:assetId/files/:fileId/download', async(req,res,next) => {
    try {
      const result = await getAssetFile({ pool,fileStore,user:req.user,assetId:req.params.assetId,fileId:req.params.fileId,trace:auditTrace(req) });
      res.type(result.file.content_type);
      res.set('content-disposition',`attachment; filename*=UTF-8''${encodeURIComponent(result.file.original_name)}`);
      res.send(result.content);
    } catch(error) { next(error); }
  });
  router.post('/assets/:assetId/files/:fileId/deactivate', async(req,res) => {
    await deactivateAssetFile({ pool,user:req.user,assetId:req.params.assetId,fileId:req.params.fileId,trace:auditTrace(req) });
    res.status(204).end();
  });
  router.get('/assets/qr/:publicId', async (req, res) => {
    const asset = await findAssetByQr(pool, req.user, req.params.publicId);
    await audit(pool, req, 'ASSET_QR_SCANNED', 'ASSET', asset.id, { qrPublicId: asset.qr_public_id });
    res.set('cache-control', 'no-store').json({ asset });
  });
  router.get('/assets/:id/qr.svg', async (req, res) => {
    const asset = await findAssetForQrLabel(pool, req.user, req.params.id);
    const baseUrl = publicBaseUrl || `${req.protocol}://${req.get('host')}`;
    const svg = await QRCode.toString(qrScanUrl(baseUrl, asset.qr_public_id), {
      type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 256,
      color: { dark: '#062b55', light: '#ffffff' }
    });
    res.set({ 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff' }).send(svg);
  });
  router.get('/assets/:id', async (req, res) => {
    requirePermission(req.user, 'asset.read'); const id = positiveInteger(req.params.id, '자산번호');
    const asset = await pool.query('SELECT * FROM assets WHERE id=$1', [id]);
    if (!asset.rowCount) throw new DomainError('자산을 찾을 수 없습니다.', 404);
    orgId(req, asset.rows[0].organization_id);
    const scope=await resolveScope(pool,req.user); if(!canAccessDepartment(scope,asset.rows[0].department_id)) throw new DomainError('허용된 부서 범위를 벗어났습니다.',403);
    const [history, assignments, files] = await Promise.all([
      pool.query('SELECT * FROM asset_status_histories WHERE asset_id=$1 ORDER BY created_at DESC', [id]),
      pool.query('SELECT aa.*,u.display_name,d.name department_name,l.name location_name FROM asset_assignments aa LEFT JOIN users u ON u.id=aa.user_id LEFT JOIN departments d ON d.id=aa.department_id LEFT JOIN locations l ON l.id=aa.location_id WHERE aa.asset_id=$1 ORDER BY aa.started_at DESC', [id]),
      pool.query("SELECT f.id,f.original_name,f.content_type,f.checksum,f.size_bytes,f.created_at,af.file_type FROM asset_files af JOIN file_records f ON f.id=af.file_id WHERE af.asset_id=$1 AND f.status='ACTIVE' ORDER BY f.created_at DESC", [id])
    ]);
    res.json({ asset: asset.rows[0], history: history.rows, assignments: assignments.rows, files: files.rows });
  });
  router.post('/assets/:id/status', async (req, res) => res.json({ asset: await changeAssetStatus(pool, req.user, req.params.id, req.body, trace(req)) }));

  router.get('/requests', async (req, res) => {
    const organizationId = orgId(req, req.query.organizationId); const all = ['MANAGER','ADMIN'].includes(req.user.role); const paging = page(req);
    const scope=await resolveScope(pool,req.user); const values=[organizationId]; const where=['r.organization_id=$1'];
    if(!all||scope.scopeType==='SELF'){values.push(req.user.id);where.push(`r.requester_id=$${values.length}`);} else if(scope.departmentIds){values.push(scope.departmentIds);where.push(`COALESCE(a.department_id,u.department_id)=ANY($${values.length}::bigint[])`);}
    values.push(paging.size,paging.offset);
    const result = await pool.query(`SELECT r.*,u.display_name requester_name,a.asset_tag FROM workflow_requests r JOIN users u ON u.id=r.requester_id
      LEFT JOIN assets a ON a.id=r.asset_id WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values);
    res.json({ requests: result.rows });
  });
  router.post('/requests', async (req, res) => res.status(201).json({ request: await createRequest(pool, req.user, req.body, trace(req)) }));
  router.post('/requests/:id/return-photo', rawEvidence, idempotency, async(req,res)=>{ const file=await uploadReturnPhoto({pool,fileStore,malwareScanner,maxBytes:fileMaxBytes,user:req.user,requestId:req.params.id,input:{content:req.body,contentType:req.get('content-type'),originalName:req.get('x-file-name')},trace:auditTrace(req)}); res.status(201).json({file:{id:file.id,originalName:file.original_name,contentType:file.content_type,checksum:file.checksum,sizeBytes:Number(file.size_bytes)}}); });
  router.post('/requests/:id/action', async (req, res) => res.json({ request: await transitionRequest(pool, req.user, req.params.id, req.body, trace(req)) }));
  router.get('/requests/:id/approvals', async(req,res)=>{ const id=positiveInteger(req.params.id,'요청번호'); const request=await pool.query(`SELECT r.*,a.department_id asset_department_id,u.department_id requester_department_id FROM workflow_requests r JOIN users u ON u.id=r.requester_id LEFT JOIN assets a ON a.id=r.asset_id WHERE r.id=$1`,[id]); if(!request.rowCount) throw new DomainError('요청을 찾을 수 없습니다.',404); const row=request.rows[0]; orgId(req,row.organization_id); if(Number(row.requester_id)!==Number(req.user.id)){requirePermission(req.user,'request.review');const scope=await resolveScope(pool,req.user);if(!canAccessDepartment(scope,row.asset_department_id||row.requester_department_id)) throw new DomainError('허용된 부서 범위를 벗어났습니다.',403);} const approvals=await pool.query(`SELECT a.step_order,a.step_name,a.approver_role,a.department_scope,a.status,a.acted_at,a.reason,u.display_name acted_by_name FROM workflow_request_approvals a LEFT JOIN users u ON u.id=a.acted_by WHERE a.request_id=$1 ORDER BY a.step_order`,[id]); res.json({request:{id:row.id,status:row.status,currentApprovalStep:row.current_approval_step,approvalStepCount:row.approval_step_count},approvals:approvals.rows}); });

  router.get('/repairs', async (req, res) => {
    requirePermission(req.user, 'asset.read'); const organizationId = orgId(req, req.query.organizationId);
    const scope=await resolveScope(pool,req.user); const values=[organizationId]; const scopeSql=scope.departmentIds?(values.push(scope.departmentIds),` AND a.department_id=ANY($2::bigint[])`):'';
    const result = await pool.query(`SELECT s.*,a.asset_tag,a.name asset_name,u.display_name reporter_name FROM service_tickets s JOIN assets a ON a.id=s.asset_id JOIN users u ON u.id=s.reporter_id
      WHERE s.organization_id=$1${scopeSql} ORDER BY s.created_at DESC LIMIT 100`, values); res.json({ repairs: result.rows });
  });
  router.post('/repairs', async (req, res) => {
    requirePermission(req.user, 'repair.create'); const id = positiveInteger(req.body.assetId, '자산번호');
    const asset = await pool.query('SELECT organization_id,department_id FROM assets WHERE id=$1', [id]); if (!asset.rowCount) throw new DomainError('자산을 찾을 수 없습니다.', 404);
    const organizationId = orgId(req, asset.rows[0].organization_id); const symptom = String(req.body.symptom || '').trim(); if (symptom.length < 2) throw new DomainError('고장 증상이 필요합니다.');
    const scope=await resolveScope(pool,req.user); if(!canAccessDepartment(scope,asset.rows[0].department_id)) throw new DomainError('허용된 부서 범위를 벗어났습니다.',403);
    const result = await pool.query(`INSERT INTO service_tickets(organization_id,asset_id,reporter_id,priority,symptom) VALUES($1,$2,$3,$4,$5) RETURNING *`, [organizationId,id,req.user.id,req.body.priority || 'NORMAL',symptom]);
    await audit(pool, req, 'REPAIR_CREATED', 'REPAIR', result.rows[0].id, { assetId:id }); res.status(201).json({ repair:result.rows[0] });
  });
  router.post('/repairs/:id/status', async (req, res) => {
    requirePermission(req.user, 'repair.manage'); const id=positiveInteger(req.params.id,'수리번호'); const status=String(req.body.status||'').toUpperCase();
    if(!['OPEN','IN_PROGRESS','WAITING','RESOLVED','CLOSED','CANCELLED'].includes(status)) throw new DomainError('올바른 수리 상태가 아닙니다.');
    const organizationId=orgId(req,req.body.organizationId); const scope=await resolveScope(pool,req.user);
    const values=[status,String(req.body.resolution||'').slice(0,1000)||null,req.body.cost==null?null:Number(req.body.cost),id,organizationId];
    const scopeSql=scope.departmentIds?(values.push(scope.departmentIds),` AND EXISTS(SELECT 1 FROM assets a WHERE a.id=service_tickets.asset_id AND a.department_id=ANY($${values.length}::bigint[]))`):'';
    const result=await pool.query(`UPDATE service_tickets SET status=$1,resolution=$2,cost=$3,updated_at=now() WHERE id=$4 AND organization_id=$5${scopeSql} RETURNING *`,values);
    if(!result.rowCount) throw new DomainError('수리 건을 찾을 수 없습니다.',404); await audit(pool,req,'REPAIR_STATUS_CHANGED','REPAIR',id,{status}); res.json({repair:result.rows[0]});
  });

  router.get('/stocktakes', async (req,res)=>{ requirePermission(req.user,'stocktake.manage'); const organizationId=orgId(req,req.query.organizationId); const scope=await resolveScope(pool,req.user); const values=[organizationId]; const scopeSql=scope.departmentIds?(values.push(scope.departmentIds),` AND EXISTS(SELECT 1 FROM stocktake_items access_si JOIN assets access_a ON access_a.id=access_si.asset_id WHERE access_si.stocktake_id=s.id AND access_a.department_id=ANY($2::bigint[]))`):''; const itemScope=scope.departmentIds?` AND EXISTS(SELECT 1 FROM assets count_a WHERE count_a.id=si.asset_id AND count_a.department_id=ANY($2::bigint[]))`:''; const result=await pool.query(`SELECT s.*,l.name location_name,(SELECT count(*) FROM stocktake_items si WHERE si.stocktake_id=s.id${itemScope})::int item_count,(SELECT count(*) FROM stocktake_items si WHERE si.stocktake_id=s.id AND si.result NOT IN ('PENDING','MATCH')${itemScope})::int mismatch_count FROM stocktakes s LEFT JOIN locations l ON l.id=s.location_id WHERE s.organization_id=$1${scopeSql} ORDER BY s.created_at DESC`,values); res.json({stocktakes:result.rows}); });
  router.get('/stocktakes/:id', async(req,res)=>{ requirePermission(req.user,'stocktake.manage'); const id=positiveInteger(req.params.id,'재물조사번호'); const organizationId=orgId(req,req.query.organizationId); const scope=await resolveScope(pool,req.user); const stocktake=await pool.query('SELECT * FROM stocktakes WHERE id=$1 AND organization_id=$2',[id,organizationId]); if(!stocktake.rowCount) throw new DomainError('재물조사를 찾을 수 없습니다.',404); const values=[id]; const scopeSql=scope.departmentIds?(values.push(scope.departmentIds),` AND a.department_id=ANY($2::bigint[])`):''; const items=await pool.query(`SELECT si.*,a.asset_tag,a.name,a.status_code,l.name location_name FROM stocktake_items si JOIN assets a ON a.id=si.asset_id LEFT JOIN locations l ON l.id=a.location_id WHERE si.stocktake_id=$1${scopeSql} ORDER BY a.asset_tag`,values); if(scope.departmentIds&&!items.rowCount) throw new DomainError('허용된 부서 범위를 벗어났습니다.',403); res.json({stocktake:stocktake.rows[0],items:items.rows}); });
  router.post('/stocktakes', async (req,res)=>{ requirePermission(req.user,'stocktake.manage'); const organizationId=orgId(req,req.body.organizationId); const scope=await resolveScope(pool,req.user); const name=String(req.body.name||'').trim(); if(name.length<2) throw new DomainError('재물조사명은 2자 이상이어야 합니다.'); if(!req.body.plannedAt||Number.isNaN(Date.parse(req.body.plannedAt))) throw new DomainError('올바른 조사 예정일이 필요합니다.'); const client=await pool.connect(); try{await client.query('BEGIN'); const result=await client.query(`INSERT INTO stocktakes(organization_id,location_id,name,planned_at,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[organizationId,req.body.locationId||null,name,req.body.plannedAt,req.user.id]); const values=[result.rows[0].id,organizationId,req.body.locationId||null]; const scopeSql=scope.departmentIds?(values.push(scope.departmentIds),` AND department_id=ANY($4::bigint[])`):''; await client.query(`INSERT INTO stocktake_items(stocktake_id,asset_id) SELECT $1,id FROM assets WHERE organization_id=$2 AND ($3::bigint IS NULL OR location_id=$3) AND status_code NOT IN ('DISPOSED','CANCELLED')${scopeSql} ON CONFLICT DO NOTHING`,values); await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address) VALUES($1,'STOCKTAKE_CREATED','STOCKTAKE',$2,'{}'::jsonb,$3,$4)`,[req.user.id,String(result.rows[0].id),req.requestId,req.ip]); await client.query('COMMIT'); res.status(201).json({stocktake:result.rows[0]});}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();} });
  router.post('/stocktakes/:id/items/:assetId', async(req,res)=>{ requirePermission(req.user,'stocktake.manage'); const id=positiveInteger(req.params.id,'실사번호'); const assetId=positiveInteger(req.params.assetId,'자산번호'); const organizationId=orgId(req,req.body.organizationId); const scope=await resolveScope(pool,req.user); const result=String(req.body.result||'').toUpperCase(); if(!['MATCH','MISSING','LOCATION_MISMATCH','DAMAGED'].includes(result)) throw new DomainError('올바른 실사 결과가 아닙니다.'); const values=[result,req.body.foundLocationId||null,String(req.body.reason||'').slice(0,500)||null,req.user.id,id,assetId,organizationId]; const scopeSql=scope.departmentIds?(values.push(scope.departmentIds),` AND EXISTS(SELECT 1 FROM assets a WHERE a.id=si.asset_id AND a.department_id=ANY($8::bigint[]))`):''; const updated=await pool.query(`UPDATE stocktake_items si SET result=$1,found_location_id=$2,reason=$3,checked_by=$4,checked_at=now(),version=version+1 FROM stocktakes s WHERE si.stocktake_id=s.id AND si.stocktake_id=$5 AND si.asset_id=$6 AND s.organization_id=$7${scopeSql} RETURNING si.asset_id,si.version`,values); if(!updated.rowCount) throw new DomainError('실사 대상을 찾을 수 없습니다.',404); await audit(pool,req,'STOCKTAKE_ITEM_CHECKED','STOCKTAKE',id,{assetId,result,version:updated.rows[0].version}); res.status(204).end(); });

  router.post('/stocktakes/:id/offline-sync', async(req,res)=>{
    requirePermission(req.user,'stocktake.manage');
    const id=positiveInteger(req.params.id,'실사번호');const organizationId=orgId(req,req.body.organizationId);const scope=await resolveScope(pool,req.user);const operations=normalizeOfflineBatch(req.body.operations);const results=[];
    for(const operation of operations){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[operation.operationId]);
        const prior=await client.query('SELECT stocktake_id,asset_id,payload_sha256,result_version FROM stocktake_offline_operations WHERE operation_id=$1 FOR UPDATE',[operation.operationId]);
        if(prior.rowCount){
          if(Number(prior.rows[0].stocktake_id)!==id||Number(prior.rows[0].asset_id)!==operation.assetId||prior.rows[0].payload_sha256!==operation.payloadSha256){await client.query('ROLLBACK');results.push({operationId:operation.operationId,status:'CONFLICT',code:'OPERATION_ID_REUSED'});continue;}
          await client.query('COMMIT');results.push({operationId:operation.operationId,status:'DUPLICATE',version:prior.rows[0].result_version});continue;
        }
        const item=await client.query(`SELECT si.result,si.version,s.status,a.department_id FROM stocktake_items si JOIN stocktakes s ON s.id=si.stocktake_id JOIN assets a ON a.id=si.asset_id WHERE si.stocktake_id=$1 AND si.asset_id=$2 AND s.organization_id=$3 FOR UPDATE`,[id,operation.assetId,organizationId]);
        if(!item.rowCount){await client.query('ROLLBACK');results.push({operationId:operation.operationId,status:'REJECTED',code:'NOT_FOUND'});continue;}
        if(scope.departmentIds&&!scope.departmentIds.includes(Number(item.rows[0].department_id))){await client.query('ROLLBACK');results.push({operationId:operation.operationId,status:'REJECTED',code:'SCOPE_DENIED'});continue;}
        if(item.rows[0].status==='CONFIRMED'||Number(item.rows[0].version)!==operation.baseVersion){await client.query('ROLLBACK');results.push({operationId:operation.operationId,status:'CONFLICT',code:item.rows[0].status==='CONFIRMED'?'STOCKTAKE_CONFIRMED':'VERSION_CHANGED',serverVersion:Number(item.rows[0].version),serverResult:item.rows[0].result});continue;}
        const updated=await client.query('UPDATE stocktake_items SET result=$1,found_location_id=$2,reason=$3,checked_by=$4,checked_at=now(),version=version+1 WHERE stocktake_id=$5 AND asset_id=$6 RETURNING version',[operation.result,operation.foundLocationId,operation.reason,req.user.id,id,operation.assetId]);
        const version=Number(updated.rows[0].version);
        await client.query('INSERT INTO stocktake_offline_operations(operation_id,stocktake_id,asset_id,actor_user_id,payload_sha256,result_version) VALUES($1,$2,$3,$4,$5,$6)',[operation.operationId,id,operation.assetId,req.user.id,operation.payloadSha256,version]);
        const current=auditTrace(req);await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address) VALUES($1,'STOCKTAKE_OFFLINE_ITEM_SYNCED','STOCKTAKE',$2,$3::jsonb,$4,$5)`,[req.user.id,String(id),JSON.stringify({assetId:operation.assetId,result:operation.result,operationId:operation.operationId,version}),current.requestId,current.ip]);
        await client.query('COMMIT');results.push({operationId:operation.operationId,status:'APPLIED',version});
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    }
    res.json({results,applied:results.filter(item=>item.status==='APPLIED').length,duplicates:results.filter(item=>item.status==='DUPLICATE').length,conflicts:results.filter(item=>item.status==='CONFLICT').length,rejected:results.filter(item=>item.status==='REJECTED').length});
  });
  router.post('/stocktakes/:id/confirm', async(req,res)=>{ requirePermission(req.user,'stocktake.manage'); const id=positiveInteger(req.params.id,'실사번호'); const organizationId=orgId(req,req.body.organizationId); const scope=await resolveScope(pool,req.user); if(scope.departmentIds){const outside=await pool.query(`SELECT count(*)::int count FROM stocktake_items si JOIN assets a ON a.id=si.asset_id JOIN stocktakes s ON s.id=si.stocktake_id WHERE si.stocktake_id=$1 AND s.organization_id=$2 AND NOT(a.department_id=ANY($3::bigint[]))`,[id,organizationId,scope.departmentIds]); if(outside.rows[0].count) throw new DomainError('다른 부서 자산이 포함된 재물조사는 확정할 수 없습니다.',403);} const pending=await pool.query(`SELECT count(*)::int count FROM stocktake_items si JOIN stocktakes s ON s.id=si.stocktake_id WHERE si.stocktake_id=$1 AND s.organization_id=$2 AND si.result='PENDING'`,[id,organizationId]); if(pending.rows[0].count) throw new DomainError(`미확인 자산 ${pending.rows[0].count}건이 있습니다.`,409); const result=await pool.query(`UPDATE stocktakes SET status='CONFIRMED',confirmed_by=$1,confirmed_at=now() WHERE id=$2 AND organization_id=$3 RETURNING *`,[req.user.id,id,organizationId]); if(!result.rowCount) throw new DomainError('실사를 찾을 수 없습니다.',404); await audit(pool,req,'STOCKTAKE_CONFIRMED','STOCKTAKE',id); res.json({stocktake:result.rows[0]}); });

  router.get('/procurement', async(req,res)=>{ requirePermission(req.user,'request.review'); const organizationId=orgId(req,req.query.organizationId); const [requests,orders,receipts]=await Promise.all([pool.query("SELECT * FROM workflow_requests WHERE organization_id=$1 AND request_type='PURCHASE' ORDER BY created_at DESC",[organizationId]),pool.query('SELECT po.*,v.name vendor_name FROM purchase_orders po LEFT JOIN vendors v ON v.id=po.vendor_id WHERE po.organization_id=$1 ORDER BY po.ordered_at DESC',[organizationId]),pool.query('SELECT r.* FROM receipts r JOIN purchase_orders po ON po.id=r.purchase_order_id WHERE po.organization_id=$1 ORDER BY r.received_at DESC',[organizationId])]); res.json({requests:requests.rows,orders:orders.rows,receipts:receipts.rows}); });
  router.post('/procurement/orders', async(req,res)=>res.status(201).json({order:await createPurchaseOrder(pool,req.user,req.body,trace(req))}));
  router.post('/procurement/receipts', async(req,res)=>res.status(201).json({receipt:await createReceipt(pool,req.user,req.body,trace(req))}));
  router.post('/procurement/inspections', async(req,res)=>res.status(201).json(await inspectReceipt(pool,req.user,req.body,trace(req))));

  router.get('/reports/summary', async(req,res)=>{ requirePermission(req.user,'report.read'); const organizationId=orgId(req,req.query.organizationId); const scope=await resolveScope(pool,req.user); const report=await getAssetReport(pool,organizationId,{},scope); const values=[organizationId]; const scopeSql=scope.departmentIds?(values.push(scope.departmentIds),` AND COALESCE(a.department_id,u.department_id)=ANY($2::bigint[])`):''; const pending=await pool.query(`SELECT count(*)::int count FROM workflow_requests r JOIN users u ON u.id=r.requester_id LEFT JOIN assets a ON a.id=r.asset_id WHERE r.organization_id=$1 AND r.status='SUBMITTED'${scopeSql}`,values); res.json({summary:{...report.summary,pending_requests:pending.rows[0].count}}); });
  router.get('/reports/assets', async(req,res)=>{ requirePermission(req.user,'report.read'); const scope=await resolveScope(pool,req.user); res.json(await getAssetReport(pool,orgId(req,req.query.organizationId),req.query,scope)); });
  router.get('/reports/assets.csv', async(req,res)=>{ requirePermission(req.user,'report.read'); const organizationId=orgId(req,req.query.organizationId); const scope=await resolveScope(pool,req.user); const report=await getReportAssets(pool,organizationId,req.query,scope); const csv=['asset_tag,name,serial_no,status,department,location,category,acquired_at,acquisition_cost',...report.assets.map(row=>[row.asset_tag,row.name,row.serial_no,row.status_code,row.department_name,row.location_name,row.category_name,row.acquired_at?.toISOString?.().slice(0,10)||row.acquired_at,row.acquisition_cost].map(safeSpreadsheetCsvCell).join(','))].join('\r\n'); await audit(pool,req,'REPORT_EXPORTED','REPORT',organizationId,{format:'csv',rows:report.assets.length,filters:report.filters}); res.set({'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="seowon-assets.csv"'}).send('\ufeff'+csv); });
  router.get('/cost/command-center', async(req,res)=>{ requirePermission(req.user,'report.read'); const organizationId=orgId(req,req.query.organizationId); const scope=await resolveScope(pool,req.user); res.json(await getCostCommandCenter(pool,req.user,organizationId,scope)); });
  router.get('/cost/roi', async(req,res)=>{ requirePermission(req.user,'report.read'); const organizationId=orgId(req,req.query.organizationId); const scope=await resolveScope(pool,req.user); res.json(await getCostRoiSummary(pool,req.user,organizationId,scope)); });
  router.post('/cost/savings', async(req,res)=>{ requirePermission(req.user,'report.read'); const organizationId=orgId(req,req.body.organizationId); const scope=await resolveScope(pool,req.user); if(req.body.assetId){const asset=await pool.query('SELECT organization_id,department_id FROM assets WHERE id=$1',[positiveInteger(req.body.assetId,'자산번호')]);if(!asset.rowCount)throw new DomainError('자산을 찾을 수 없습니다.',404);orgId(req,asset.rows[0].organization_id);if(!canAccessDepartment(scope,asset.rows[0].department_id))throw new DomainError('허용된 부서 범위를 벗어났습니다.',403);} const result=await recordSavingsEvent(pool,req.user,{...req.body,organizationId}); await audit(pool,req,'COST_SAVINGS_RECORDED','COST_SAVINGS',result.id,{savingsType:result.savingsType,avoidedAmount:result.avoidedAmount,assetId:result.assetId}); res.status(201).json({savings:result}); });
  router.get('/notifications', async(req,res)=>{
    const organizationId=orgId(req,req.query.organizationId); const limit=Math.min(100,Math.max(1,Number(req.query.limit)||30)); const scope=await resolveScope(pool,req.user); const values=[organizationId,req.user.id];
    let scopeSql='';
    if(scope.departmentIds?.length){
      values.push(scope.departmentIds);
      const departmentParam=values.length;
      scopeSql=` AND (n.recipient_user_id=$2 OR (n.recipient_user_id IS NULL AND ((n.entity_type='ASSET' AND EXISTS (SELECT 1 FROM assets na WHERE na.id::text=n.entity_id AND na.organization_id=n.organization_id AND na.department_id=ANY($${departmentParam}::bigint[]))) OR (n.entity_type='REQUEST' AND EXISTS (SELECT 1 FROM workflow_requests nr JOIN users nu ON nu.id=nr.requester_id LEFT JOIN assets nra ON nra.id=nr.asset_id WHERE nr.id::text=n.entity_id AND nr.organization_id=n.organization_id AND COALESCE(nra.department_id,nu.department_id)=ANY($${departmentParam}::bigint[]))))))`;
    } else {
      scopeSql=' AND (n.recipient_user_id IS NULL OR n.recipient_user_id=$2)';
    }
    values.push(limit); const limitParam=values.length;
    const result=await pool.query(`SELECT n.* FROM notifications n WHERE n.organization_id=$1${scopeSql} ORDER BY n.created_at DESC LIMIT $${limitParam}`,values); res.json({notifications:result.rows});
  });
  router.get('/ai/recommendations', async(req,res)=>{ requirePermission(req.user,'report.read'); const scope=await resolveScope(pool,req.user); const result=await recommendActions(pool,req.user,req.query,scope,aiProvider); return res.json(result); });
  router.get('/ai/search', async(req,res)=>{ requirePermission(req.user,'asset.read'); const scope=await resolveScope(pool,req.user); res.json(await searchAssets(pool,req.user,req.query,scope)); });
  router.get('/ai/anomalies', async(req,res)=>{ requirePermission(req.user,'report.read'); const scope=await resolveScope(pool,req.user); const result=await detectAnomalies(pool,req.user,req.query,scope); return res.json(result); });
  router.post('/ai/feedback', async(req,res)=>{
    requirePermission(req.user,'report.read');
    const organizationId=orgId(req,req.body.organizationId); const feedback=normalizeFeedback(req.body);
    const assetId=req.body.assetId==null||req.body.assetId===''?null:positiveInteger(req.body.assetId,'자산번호');
    const requestId=req.body.requestId==null||req.body.requestId===''?null:positiveInteger(req.body.requestId,'요청번호'); const scope=await resolveScope(pool,req.user);
    if(assetId){const asset=await pool.query('SELECT organization_id,department_id FROM assets WHERE id=$1',[assetId]);if(!asset.rowCount)throw new DomainError('자산을 찾을 수 없습니다.',404);orgId(req,asset.rows[0].organization_id);if(!canAccessDepartment(scope,asset.rows[0].department_id))throw new DomainError('허용된 부서 범위를 벗어났습니다.',403);}
    if(requestId){const request=await pool.query('SELECT organization_id,requester_id FROM workflow_requests WHERE id=$1',[requestId]);if(!request.rowCount)throw new DomainError('요청을 찾을 수 없습니다.',404);orgId(req,request.rows[0].organization_id);if(req.user.role==='USER'&&Number(request.rows[0].requester_id)!==Number(req.user.id))throw new DomainError('허용된 요청 범위를 벗어났습니다.',403);}
    const result=await pool.query(`INSERT INTO ai_recommendation_feedback(organization_id,asset_id,request_id,action_type,decision,reason,provider,model_version,estimated_cost,avoided_cost,confidence,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,created_at`,[organizationId,assetId,requestId,feedback.actionType,feedback.decision,feedback.reason,feedback.provider,feedback.modelVersion,feedback.estimatedCost,feedback.avoidedCost,feedback.confidence,req.user.id]);
    await audit(pool,req,'AI_RECOMMENDATION_FEEDBACK','AI_RECOMMENDATION',result.rows[0].id,{assetId,requestId,decision:feedback.decision,actionType:feedback.actionType}); res.status(201).json({feedback:{id:result.rows[0].id,createdAt:result.rows[0].created_at}});
  });
  router.get('/ai/quality', async(req,res)=>{
    requirePermission(req.user,'report.read'); const organizationId=orgId(req,req.query.organizationId); const scope=await resolveScope(pool,req.user); const values=[organizationId]; let scopeSql='';
    if(scope.departmentIds?.length){values.push(scope.departmentIds);scopeSql=` AND (a.department_id=ANY($${values.length}::bigint[]) OR f.asset_id IS NULL)`;}
    const [feedback,evaluations]=await Promise.all([pool.query(`SELECT count(*)::int total,count(*) FILTER(WHERE f.decision IN ('ACCEPTED','EXECUTED'))::int positive,count(*) FILTER(WHERE f.decision='REJECTED')::int rejected,COALESCE(sum(f.avoided_cost),0)::numeric avoided_cost FROM ai_recommendation_feedback f LEFT JOIN assets a ON a.id=f.asset_id AND a.organization_id=f.organization_id WHERE f.organization_id=$1${scopeSql}` ,values),pool.query('SELECT id,provider,model_version,dataset_version,sample_count,precision_score,recall_score,cost_per_request,status,metrics,created_at FROM ai_evaluation_runs WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 10',[organizationId])]);
    res.json({organizationId,feedback:feedback.rows[0],evaluations:evaluations.rows});
  });
  router.post('/ai/evaluations', async(req,res)=>{
    requirePermission(req.user,'admin.manage'); const organizationId=orgId(req,req.body.organizationId); const evaluation=normalizeEvaluation(req.body); if(evaluation.costPerRequest!=null&&(!Number.isFinite(evaluation.costPerRequest)||evaluation.costPerRequest<0))throw new DomainError('요청당 비용은 0 이상 숫자여야 합니다.');
    const result=await pool.query(`INSERT INTO ai_evaluation_runs(organization_id,provider,model_version,dataset_version,sample_count,precision_score,recall_score,cost_per_request,status,metrics,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) RETURNING id,created_at`,[organizationId,evaluation.provider,evaluation.modelVersion,evaluation.datasetVersion,evaluation.sampleCount,evaluation.precision,evaluation.recall,evaluation.costPerRequest,evaluation.status,JSON.stringify(evaluation.metrics),req.user.id]);
    await audit(pool,req,'AI_EVALUATION_RECORDED','AI_EVALUATION',result.rows[0].id,{provider:evaluation.provider,modelVersion:evaluation.modelVersion,datasetVersion:evaluation.datasetVersion,status:evaluation.status}); res.status(201).json({evaluation:{id:result.rows[0].id,createdAt:result.rows[0].created_at}});
  });
  router.use('/ai/ocr', async(req,res,next)=>{
    const organizationId=orgId(req,req.body.organizationId); const assetId=req.body.assetId==null||req.body.assetId===''?null:positiveInteger(req.body.assetId,'자산번호'); const fileId=req.body.fileId==null||req.body.fileId===''?null:positiveInteger(req.body.fileId,'파일번호'); const scope=await resolveScope(pool,req.user);
    const text=String(req.body.text||'').trim(); if(!assetId&&!fileId&&!text) throw new DomainError('자산번호, 파일번호 또는 OCR 텍스트가 필요합니다.',400);
    if(assetId){ const asset=await pool.query('SELECT organization_id,department_id FROM assets WHERE id=$1',[assetId]); if(!asset.rowCount) throw new DomainError('자산을 찾을 수 없습니다.',404); orgId(req,asset.rows[0].organization_id); if(!canAccessDepartment(scope,asset.rows[0].department_id)) throw new DomainError('허용된 부서 범위를 벗어났습니다.',403); }
    if(fileId){ const file=await pool.query("SELECT organization_id,status FROM file_records WHERE id=$1",[fileId]); if(!file.rowCount||file.rows[0].status!=='ACTIVE') throw new DomainError('활성 파일을 찾을 수 없습니다.',404); orgId(req,file.rows[0].organization_id); const links=await pool.query('SELECT af.asset_id,a.department_id FROM asset_files af JOIN assets a ON a.id=af.asset_id WHERE af.file_id=$1',[fileId]); if(links.rowCount&&(!assetId||!links.rows.some(row=>Number(row.asset_id)===assetId))) throw new DomainError('파일과 자산 연결이 일치하지 않습니다.',409); if(!assetId&&links.rowCount&&!links.rows.some(row=>canAccessDepartment(scope,row.department_id))) throw new DomainError('허용된 부서 범위를 벗어났습니다.',403); }
    req.body.organizationId=organizationId; req.body.assetId=assetId; req.body.fileId=fileId; req.body.text=text; return next();
  });
  router.post('/ai/ocr', async(req,res)=>{ requirePermission(req.user,'asset.update'); const organizationId=orgId(req,req.body.organizationId); const result=await extractDocument({provider:aiProvider?.ocr,organizationId,assetId:req.body.assetId,fileId:req.body.fileId,input:req.body}); if(result.status==='NOT_CONFIGURED'&&isProduction) throw new DomainError('운영 OCR 공급자가 구성되지 않았습니다.',503); const saved=await pool.query(`INSERT INTO document_extractions(organization_id,asset_id,source_file_id,provider,model_version,status,fields,confidence,created_by) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9) RETURNING id,created_at`,[organizationId,req.body.assetId||null,req.body.fileId||null,result.provider,result.modelVersion,result.status,JSON.stringify(result.fields),JSON.stringify(result.confidence),req.user.id]); res.status(result.status==='NOT_CONFIGURED'?501:200).json({extraction:{...result,id:saved.rows[0].id,createdAt:saved.rows[0].created_at}}); });

  router.get('/admin', async(req,res)=>{
    requirePermission(req.user,'admin.manage');
    const organizationId=orgId(req,req.query.organizationId);
    const orgFilter=req.user.isSystemAdmin?'':' WHERE id=$1';
    const orgValues=req.user.isSystemAdmin?[]:[organizationId];
    const [orgs,depts,locations,users,invitations,outbox]=await Promise.all([
      pool.query(`SELECT * FROM organizations${orgFilter} ORDER BY name`,orgValues),
      pool.query(`SELECT * FROM departments WHERE organization_id=$1 ORDER BY parent_id NULLS FIRST,name`,[organizationId]),
      pool.query(`SELECT * FROM locations WHERE organization_id=$1 ORDER BY name`,[organizationId]),
      pool.query(`SELECT u.id,u.email,u.display_name,u.role,u.status,u.organization_id,u.department_id,u.mfa_enabled,u.is_system_admin,s.scope_type,s.department_id scope_department_id
        FROM users u LEFT JOIN LATERAL (SELECT scope_type,department_id FROM user_role_scopes WHERE user_id=u.id AND role_code=u.role ORDER BY created_at DESC LIMIT 1) s ON true
        WHERE u.organization_id=$1 ORDER BY u.display_name`,[organizationId]),
      pool.query(`SELECT i.id,i.organization_id,i.department_id,i.email,i.display_name,i.role,i.scope_type,i.expires_at,i.accepted_at,i.revoked_at,i.created_at,d.name department_name
        FROM user_invitations i LEFT JOIN departments d ON d.id=i.department_id WHERE i.organization_id=$1 ORDER BY i.created_at DESC LIMIT 100`,[organizationId]),
      pool.query(`SELECT * FROM outbox_events WHERE payload->>'organizationId'=$1 ORDER BY created_at DESC LIMIT 50`,[String(organizationId)])
    ]);
    res.json({organizations:orgs.rows,departments:depts.rows,locations:locations.rows,users:users.rows,invitations:invitations.rows,outbox:outbox.rows});
  });
  router.post('/admin/departments', async(req,res)=>{ const department=await createOrganizationUnit(pool,req.user,req.body.organizationId,req.body,trace(req)); res.status(201).json({department}); });
  router.post('/admin/invitations', async(req,res)=>{ const created=await createInvitation(pool,req.user,req.body.organizationId,req.body,trace(req)); res.status(201).json({invitation:created.invitation,...(!isProduction?{developmentToken:created.rawToken}:{})}); });
  router.post('/admin/invitations/:id/revoke', async(req,res)=>res.json({invitation:await revokeInvitation(pool,req.user,req.params.id,trace(req))}));
  router.get('/admin/approval-policies', async(req,res)=>res.json({policies:await listApprovalPolicies(pool,req.user,req.query.organizationId)}));
  router.post('/admin/approval-policies', async(req,res)=>res.status(201).json({policy:await createApprovalPolicy(pool,req.user,req.body.organizationId,req.body,trace(req))}));
  router.get('/admin/references', async(req,res)=>res.json({references:await getAdminReferences(pool,req.user,req.query.organizationId)}));
  router.post('/admin/references/:kind', async(req,res)=>res.status(201).json({reference:await createReference(pool,req.user,req.params.kind,req.body.organizationId,req.body,trace(req))}));
  router.patch('/admin/references/:kind/:id', async(req,res)=>res.json({reference:await updateReference(pool,req.user,req.params.kind,req.params.id,req.body.organizationId,req.body,trace(req))}));
  router.patch('/admin/users/:id', async(req,res)=>{ requirePermission(req.user,'admin.manage'); const id=positiveInteger(req.params.id,'사용자번호'); const role=String(req.body.role||'').toUpperCase(); const status=String(req.body.status||'').toUpperCase(); const scopeType=String(req.body.scopeType||(role==='ADMIN'?'ALL':role==='MANAGER'?'ORGANIZATION':'DEPARTMENT')).toUpperCase(); const departmentId=req.body.departmentId?positiveInteger(req.body.departmentId,'소속 조직'):null; if(!['USER','MANAGER','ADMIN'].includes(role)||!['ACTIVE','INACTIVE','LOCKED'].includes(status)||!['ALL','ORGANIZATION','DEPARTMENT','SELF'].includes(scopeType)) throw new DomainError('올바른 역할, 상태, 데이터 범위가 필요합니다.'); if(scopeType==='DEPARTMENT'&&!departmentId) throw new DomainError('부서 범위에는 소속 조직이 필요합니다.'); const client=await pool.connect(); try{await client.query('BEGIN'); const target=await client.query('SELECT organization_id FROM users WHERE id=$1 FOR UPDATE',[id]); if(!target.rowCount) throw new DomainError('사용자를 찾을 수 없습니다.',404); if(departmentId){const department=await client.query("SELECT id FROM departments WHERE id=$1 AND organization_id=$2 AND status='ACTIVE'",[departmentId,target.rows[0].organization_id]); if(!department.rowCount) throw new DomainError('같은 조직의 활성 부서만 지정할 수 있습니다.',409);} const result=await client.query(`UPDATE users SET role=$1,status=$2,department_id=$3,updated_at=now() WHERE id=$4 RETURNING id,email,display_name,role,status,department_id,mfa_enabled`,[role,status,departmentId,id]); await client.query('DELETE FROM user_role_scopes WHERE user_id=$1',[id]); await client.query(`INSERT INTO user_role_scopes(user_id,role_code,organization_id,department_id,scope_type) VALUES($1,$2,$3,$4,$5)`,[id,role,target.rows[0].organization_id,scopeType==='DEPARTMENT'?departmentId:null,scopeType]); const current=auditTrace(req); await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address) VALUES($1,'USER_ACCESS_CHANGED','USER',$2,$3::jsonb,$4,$5)`,[req.user.id,String(id),JSON.stringify({role,status,scopeType,departmentId}),current.requestId,current.ip]); await client.query('COMMIT'); res.json({user:{...result.rows[0],scope_type:scopeType,scope_department_id:scopeType==='DEPARTMENT'?departmentId:null}});}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();} });

  return router;
}

module.exports = { createEnterpriseRouter };
