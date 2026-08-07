const express = require('express');
const { DomainError, positiveInteger } = require('./services/inventory-service');
const { requirePermission, requireOrganization, createAsset, changeAssetStatus, createRequest, transitionRequest, createPurchaseOrder, createReceipt, inspectReceipt } = require('./services/enterprise-service');
const { getAssetReport, getReportAssets } = require('./services/reporting-service');
const { createOrganizationUnit, createInvitation, revokeInvitation } = require('./services/organization-service');
const { getOperationalReferences, getAdminReferences, createReference, updateReference } = require('./services/reference-service');
const { auditTrace } = require('./observability');
const { uploadAssetFile, getAssetFile, deactivateAssetFile } = require('./services/file-service');

const page = req => ({ size: Math.min(100, Math.max(1, Number(req.query.size) || 25)), offset: Math.max(0, Number(req.query.page) || 0) * Math.min(100, Math.max(1, Number(req.query.size) || 25)) });
const trace = req => ({ ...auditTrace(req), idempotencyKey: String(req.get('idempotency-key') || '').slice(0, 100) || null });
const orgId = (req, value) => requireOrganization(req.user, value || req.user.organizationId);

async function audit(pool, req, action, type, id, metadata = {}) {
  const current = auditTrace(req);
  await pool.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)`, [req.user.id, action, type, String(id), JSON.stringify(metadata), current.requestId, current.ip]);
}

function createEnterpriseRouter({ pool, apiAuth, requireRecentReauth, isProduction = false, fileStore, fileMaxBytes = 5 * 1024 * 1024 }) {
  const router = express.Router();
  router.use(apiAuth);
  router.use((req, res, next) => {
    if (req.path.startsWith('/admin/') && req.method !== 'GET') return requireRecentReauth(req, res, next);
    next();
  });

  router.get('/reference', async (req, res) => {
    res.json(await getOperationalReferences(pool,req.user,req.query.organizationId));
  });

  router.get('/assets', async (req, res) => {
    requirePermission(req.user, 'asset.read');
    const organizationId = orgId(req, req.query.organizationId); const paging = page(req);
    const q = String(req.query.q || '').trim(); const status = String(req.query.status || '').trim().toUpperCase();
    const values = [organizationId]; const where = ['a.organization_id=$1'];
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

  router.post('/assets', async (req, res) => res.status(201).json({ asset: await createAsset(pool, req.user, req.body, trace(req)) }));
  const rawEvidence = express.raw({ type: ['image/jpeg','image/png','application/pdf'], limit: fileMaxBytes });
  router.post('/assets/:id/files', rawEvidence, async (req,res) => {
    const file = await uploadAssetFile({ pool,fileStore,maxBytes:fileMaxBytes,user:req.user,assetId:req.params.id,
      input:{ content:req.body,contentType:req.get('content-type'),originalName:req.get('x-file-name'),fileType:req.get('x-file-type') },trace:auditTrace(req) });
    res.status(201).json({ file:{ id:file.id,originalName:file.original_name,contentType:file.content_type,checksum:file.checksum,sizeBytes:Number(file.size_bytes),status:file.status } });
  });
  router.get('/assets/:assetId/files/:fileId/download', async(req,res,next) => {
    try {
      const result = await getAssetFile({ pool,fileStore,user:req.user,assetId:req.params.assetId,fileId:req.params.fileId,trace:auditTrace(req) });
      res.type(result.file.content_type);
      res.download(result.filePath,result.file.original_name,error=>error&&next(error));
    } catch(error) { next(error); }
  });
  router.post('/assets/:assetId/files/:fileId/deactivate', async(req,res) => {
    await deactivateAssetFile({ pool,user:req.user,assetId:req.params.assetId,fileId:req.params.fileId,trace:auditTrace(req) });
    res.status(204).end();
  });
  router.get('/assets/:id', async (req, res) => {
    requirePermission(req.user, 'asset.read'); const id = positiveInteger(req.params.id, '자산번호');
    const asset = await pool.query('SELECT * FROM assets WHERE id=$1', [id]);
    if (!asset.rowCount) throw new DomainError('자산을 찾을 수 없습니다.', 404);
    orgId(req, asset.rows[0].organization_id);
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
    const result = await pool.query(`SELECT r.*,u.display_name requester_name,a.asset_tag FROM workflow_requests r JOIN users u ON u.id=r.requester_id
      LEFT JOIN assets a ON a.id=r.asset_id WHERE r.organization_id=$1 ${all ? '' : 'AND r.requester_id=$2'} ORDER BY r.created_at DESC LIMIT $${all ? 2 : 3} OFFSET $${all ? 3 : 4}`,
    all ? [organizationId, paging.size, paging.offset] : [organizationId, req.user.id, paging.size, paging.offset]);
    res.json({ requests: result.rows });
  });
  router.post('/requests', async (req, res) => res.status(201).json({ request: await createRequest(pool, req.user, req.body, trace(req)) }));
  router.post('/requests/:id/action', async (req, res) => res.json({ request: await transitionRequest(pool, req.user, req.params.id, req.body, trace(req)) }));

  router.get('/repairs', async (req, res) => {
    requirePermission(req.user, 'asset.read'); const organizationId = orgId(req, req.query.organizationId);
    const result = await pool.query(`SELECT s.*,a.asset_tag,a.name asset_name,u.display_name reporter_name FROM service_tickets s JOIN assets a ON a.id=s.asset_id JOIN users u ON u.id=s.reporter_id
      WHERE s.organization_id=$1 ORDER BY s.created_at DESC LIMIT 100`, [organizationId]); res.json({ repairs: result.rows });
  });
  router.post('/repairs', async (req, res) => {
    requirePermission(req.user, 'repair.create'); const id = positiveInteger(req.body.assetId, '자산번호');
    const asset = await pool.query('SELECT organization_id FROM assets WHERE id=$1', [id]); if (!asset.rowCount) throw new DomainError('자산을 찾을 수 없습니다.', 404);
    const organizationId = orgId(req, asset.rows[0].organization_id); const symptom = String(req.body.symptom || '').trim(); if (symptom.length < 2) throw new DomainError('고장 증상이 필요합니다.');
    const result = await pool.query(`INSERT INTO service_tickets(organization_id,asset_id,reporter_id,priority,symptom) VALUES($1,$2,$3,$4,$5) RETURNING *`, [organizationId,id,req.user.id,req.body.priority || 'NORMAL',symptom]);
    await audit(pool, req, 'REPAIR_CREATED', 'REPAIR', result.rows[0].id, { assetId:id }); res.status(201).json({ repair:result.rows[0] });
  });
  router.post('/repairs/:id/status', async (req, res) => {
    requirePermission(req.user, 'repair.manage'); const id=positiveInteger(req.params.id,'수리번호'); const status=String(req.body.status||'').toUpperCase();
    if(!['OPEN','IN_PROGRESS','WAITING','RESOLVED','CLOSED','CANCELLED'].includes(status)) throw new DomainError('올바른 수리 상태가 아닙니다.');
    const result=await pool.query(`UPDATE service_tickets SET status=$1,resolution=$2,cost=$3,updated_at=now() WHERE id=$4 AND organization_id=$5 RETURNING *`,[status,String(req.body.resolution||'').slice(0,1000)||null,req.body.cost==null?null:Number(req.body.cost),id,orgId(req,req.body.organizationId)]);
    if(!result.rowCount) throw new DomainError('수리 건을 찾을 수 없습니다.',404); await audit(pool,req,'REPAIR_STATUS_CHANGED','REPAIR',id,{status}); res.json({repair:result.rows[0]});
  });

  router.get('/stocktakes', async (req,res)=>{ requirePermission(req.user,'stocktake.manage'); const organizationId=orgId(req,req.query.organizationId); const result=await pool.query(`SELECT s.*,l.name location_name,(SELECT count(*) FROM stocktake_items si WHERE si.stocktake_id=s.id)::int item_count,(SELECT count(*) FROM stocktake_items si WHERE si.stocktake_id=s.id AND si.result NOT IN ('PENDING','MATCH'))::int mismatch_count FROM stocktakes s LEFT JOIN locations l ON l.id=s.location_id WHERE s.organization_id=$1 ORDER BY s.created_at DESC`,[organizationId]); res.json({stocktakes:result.rows}); });
  router.get('/stocktakes/:id', async(req,res)=>{ requirePermission(req.user,'stocktake.manage'); const id=positiveInteger(req.params.id,'재물조사번호'); const organizationId=orgId(req,req.query.organizationId); const stocktake=await pool.query('SELECT * FROM stocktakes WHERE id=$1 AND organization_id=$2',[id,organizationId]); if(!stocktake.rowCount) throw new DomainError('재물조사를 찾을 수 없습니다.',404); const items=await pool.query(`SELECT si.*,a.asset_tag,a.name,a.status_code,l.name location_name FROM stocktake_items si JOIN assets a ON a.id=si.asset_id LEFT JOIN locations l ON l.id=a.location_id WHERE si.stocktake_id=$1 ORDER BY a.asset_tag`,[id]); res.json({stocktake:stocktake.rows[0],items:items.rows}); });
  router.post('/stocktakes', async (req,res)=>{ requirePermission(req.user,'stocktake.manage'); const organizationId=orgId(req,req.body.organizationId); const name=String(req.body.name||'').trim(); if(name.length<2) throw new DomainError('재물조사명은 2자 이상이어야 합니다.'); if(!req.body.plannedAt||Number.isNaN(Date.parse(req.body.plannedAt))) throw new DomainError('올바른 조사 예정일이 필요합니다.'); const result=await pool.query(`INSERT INTO stocktakes(organization_id,location_id,name,planned_at,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[organizationId,req.body.locationId||null,name,req.body.plannedAt,req.user.id]); await pool.query(`INSERT INTO stocktake_items(stocktake_id,asset_id) SELECT $1,id FROM assets WHERE organization_id=$2 AND ($3::bigint IS NULL OR location_id=$3) AND status_code NOT IN ('DISPOSED','CANCELLED') ON CONFLICT DO NOTHING`,[result.rows[0].id,organizationId,req.body.locationId||null]); await audit(pool,req,'STOCKTAKE_CREATED','STOCKTAKE',result.rows[0].id); res.status(201).json({stocktake:result.rows[0]}); });
  router.post('/stocktakes/:id/items/:assetId', async(req,res)=>{ requirePermission(req.user,'stocktake.manage'); const id=positiveInteger(req.params.id,'실사번호'); const assetId=positiveInteger(req.params.assetId,'자산번호'); const organizationId=orgId(req,req.body.organizationId); const result=String(req.body.result||'').toUpperCase(); if(!['MATCH','MISSING','LOCATION_MISMATCH','DAMAGED'].includes(result)) throw new DomainError('올바른 실사 결과가 아닙니다.'); const updated=await pool.query(`UPDATE stocktake_items si SET result=$1,found_location_id=$2,reason=$3,checked_by=$4,checked_at=now() FROM stocktakes s WHERE si.stocktake_id=s.id AND si.stocktake_id=$5 AND si.asset_id=$6 AND s.organization_id=$7 RETURNING si.asset_id`,[result,req.body.foundLocationId||null,String(req.body.reason||'').slice(0,500)||null,req.user.id,id,assetId,organizationId]); if(!updated.rowCount) throw new DomainError('실사 대상을 찾을 수 없습니다.',404); await audit(pool,req,'STOCKTAKE_ITEM_CHECKED','STOCKTAKE',id,{assetId,result}); res.status(204).end(); });
  router.post('/stocktakes/:id/confirm', async(req,res)=>{ requirePermission(req.user,'stocktake.manage'); const id=positiveInteger(req.params.id,'실사번호'); const organizationId=orgId(req,req.body.organizationId); const pending=await pool.query(`SELECT count(*)::int count FROM stocktake_items si JOIN stocktakes s ON s.id=si.stocktake_id WHERE si.stocktake_id=$1 AND s.organization_id=$2 AND si.result='PENDING'`,[id,organizationId]); if(pending.rows[0].count) throw new DomainError(`미확인 자산 ${pending.rows[0].count}건이 있습니다.`,409); const result=await pool.query(`UPDATE stocktakes SET status='CONFIRMED',confirmed_by=$1,confirmed_at=now() WHERE id=$2 AND organization_id=$3 RETURNING *`,[req.user.id,id,organizationId]); if(!result.rowCount) throw new DomainError('실사를 찾을 수 없습니다.',404); await audit(pool,req,'STOCKTAKE_CONFIRMED','STOCKTAKE',id); res.json({stocktake:result.rows[0]}); });

  router.get('/procurement', async(req,res)=>{ requirePermission(req.user,'request.review'); const organizationId=orgId(req,req.query.organizationId); const [requests,orders,receipts]=await Promise.all([pool.query("SELECT * FROM workflow_requests WHERE organization_id=$1 AND request_type='PURCHASE' ORDER BY created_at DESC",[organizationId]),pool.query('SELECT po.*,v.name vendor_name FROM purchase_orders po LEFT JOIN vendors v ON v.id=po.vendor_id WHERE po.organization_id=$1 ORDER BY po.ordered_at DESC',[organizationId]),pool.query('SELECT r.* FROM receipts r JOIN purchase_orders po ON po.id=r.purchase_order_id WHERE po.organization_id=$1 ORDER BY r.received_at DESC',[organizationId])]); res.json({requests:requests.rows,orders:orders.rows,receipts:receipts.rows}); });
  router.post('/procurement/orders', async(req,res)=>res.status(201).json({order:await createPurchaseOrder(pool,req.user,req.body,trace(req))}));
  router.post('/procurement/receipts', async(req,res)=>res.status(201).json({receipt:await createReceipt(pool,req.user,req.body,trace(req))}));
  router.post('/procurement/inspections', async(req,res)=>res.status(201).json(await inspectReceipt(pool,req.user,req.body,trace(req))));

  router.get('/reports/summary', async(req,res)=>{ requirePermission(req.user,'report.read'); const organizationId=orgId(req,req.query.organizationId); const result=await pool.query(`SELECT (SELECT count(*) FROM assets WHERE organization_id=$1)::int assets,(SELECT count(*) FROM assets WHERE organization_id=$1 AND status_code='AVAILABLE')::int available,(SELECT count(*) FROM assets WHERE organization_id=$1 AND status_code IN ('ASSIGNED','IN_USE'))::int in_use,(SELECT count(*) FROM assets WHERE organization_id=$1 AND status_code='REPAIR')::int repair,(SELECT count(*) FROM assets WHERE organization_id=$1 AND status_code='LOST')::int lost,(SELECT count(*) FROM workflow_requests WHERE organization_id=$1 AND status='SUBMITTED')::int pending_requests,(SELECT coalesce(sum(acquisition_cost),0) FROM assets WHERE organization_id=$1) total_cost`,[organizationId]); res.json({summary:result.rows[0]}); });
  router.get('/reports/assets', async(req,res)=>{ requirePermission(req.user,'report.read'); res.json(await getAssetReport(pool,orgId(req,req.query.organizationId),req.query)); });
  router.get('/reports/assets.csv', async(req,res)=>{ requirePermission(req.user,'report.read'); const organizationId=orgId(req,req.query.organizationId); const report=await getReportAssets(pool,organizationId,req.query); const esc=value=>`"${String(value??'').replaceAll('"','""')}"`; const csv=['asset_tag,name,serial_no,status,department,location,category,acquired_at,acquisition_cost',...report.assets.map(row=>[row.asset_tag,row.name,row.serial_no,row.status_code,row.department_name,row.location_name,row.category_name,row.acquired_at?.toISOString?.().slice(0,10)||row.acquired_at,row.acquisition_cost].map(esc).join(','))].join('\r\n'); await audit(pool,req,'REPORT_EXPORTED','REPORT',organizationId,{format:'csv',rows:report.assets.length,filters:report.filters}); res.set({'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="seowon-assets.csv"'}).send('\ufeff'+csv); });

  router.get('/admin', async(req,res)=>{ requirePermission(req.user,'admin.manage'); const [orgs,depts,locations,users,invitations,outbox]=await Promise.all([pool.query('SELECT * FROM organizations ORDER BY name'),pool.query('SELECT * FROM departments ORDER BY organization_id,parent_id NULLS FIRST,name'),pool.query('SELECT * FROM locations ORDER BY name'),pool.query('SELECT id,email,display_name,role,status,organization_id,department_id,mfa_enabled FROM users ORDER BY display_name'),pool.query(`SELECT i.id,i.organization_id,i.department_id,i.email,i.display_name,i.role,i.scope_type,i.expires_at,i.accepted_at,i.revoked_at,i.created_at,d.name department_name
    FROM user_invitations i LEFT JOIN departments d ON d.id=i.department_id ORDER BY i.created_at DESC LIMIT 100`),pool.query('SELECT * FROM outbox_events ORDER BY created_at DESC LIMIT 50')]); res.json({organizations:orgs.rows,departments:depts.rows,locations:locations.rows,users:users.rows,invitations:invitations.rows,outbox:outbox.rows}); });
  router.post('/admin/departments', async(req,res)=>{ const department=await createOrganizationUnit(pool,req.user,req.body.organizationId,req.body,trace(req)); res.status(201).json({department}); });
  router.post('/admin/invitations', async(req,res)=>{ const created=await createInvitation(pool,req.user,req.body.organizationId,req.body,trace(req)); res.status(201).json({invitation:created.invitation,...(!isProduction?{developmentToken:created.rawToken}:{})}); });
  router.post('/admin/invitations/:id/revoke', async(req,res)=>res.json({invitation:await revokeInvitation(pool,req.user,req.params.id,trace(req))}));
  router.get('/admin/references', async(req,res)=>res.json({references:await getAdminReferences(pool,req.user,req.query.organizationId)}));
  router.post('/admin/references/:kind', async(req,res)=>res.status(201).json({reference:await createReference(pool,req.user,req.params.kind,req.body.organizationId,req.body,trace(req))}));
  router.patch('/admin/references/:kind/:id', async(req,res)=>res.json({reference:await updateReference(pool,req.user,req.params.kind,req.params.id,req.body.organizationId,req.body,trace(req))}));
  router.patch('/admin/users/:id', async(req,res)=>{ requirePermission(req.user,'admin.manage'); const id=positiveInteger(req.params.id,'사용자번호'); const role=String(req.body.role||'').toUpperCase(); const status=String(req.body.status||'').toUpperCase(); if(!['USER','MANAGER','ADMIN'].includes(role)||!['ACTIVE','INACTIVE','LOCKED'].includes(status)) throw new DomainError('올바른 역할과 상태가 필요합니다.'); const result=await pool.query(`UPDATE users SET role=$1,status=$2,department_id=$3,mfa_enabled=$4,updated_at=now() WHERE id=$5 RETURNING id,email,display_name,role,status,department_id,mfa_enabled`,[role,status,req.body.departmentId||null,Boolean(req.body.mfaEnabled),id]); if(!result.rowCount) throw new DomainError('사용자를 찾을 수 없습니다.',404); await audit(pool,req,'USER_ACCESS_CHANGED','USER',id,{role,status}); res.json({user:result.rows[0]}); });

  return router;
}

module.exports = { createEnterpriseRouter };
