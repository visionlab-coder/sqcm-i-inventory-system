async function findAsset(pool, assetId) {
  const result = await pool.query('SELECT id,organization_id,department_id FROM assets WHERE id=$1', [assetId]);
  return result.rows[0] || null;
}

async function createAssetFile(pool, input, trace) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const file = await client.query(`INSERT INTO file_records
      (organization_id,storage_key,original_name,content_type,checksum,size_bytes,storage_driver,uploaded_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [input.organizationId,input.storageKey,input.originalName,input.contentType,input.checksum,input.sizeBytes,input.storageDriver,input.userId]);
    await client.query('INSERT INTO asset_files(asset_id,file_id,file_type) VALUES($1,$2,$3)', [input.assetId,file.rows[0].id,input.fileType]);
    await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
      VALUES($1,'FILE_UPLOADED','FILE',$2,$3::jsonb,$4,$5)`,
    [input.userId,String(file.rows[0].id),JSON.stringify({assetId:input.assetId,fileType:input.fileType,sizeBytes:input.sizeBytes,checksum:input.checksum}),trace.requestId,trace.ip]);
    await client.query('COMMIT');
    return file.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function findActiveAssetFile(pool, assetId, fileId) {
  const result = await pool.query(`SELECT f.*,af.asset_id,af.file_type,a.organization_id asset_organization_id,a.department_id asset_department_id
    FROM asset_files af JOIN file_records f ON f.id=af.file_id JOIN assets a ON a.id=af.asset_id
    WHERE af.asset_id=$1 AND af.file_id=$2 AND f.status='ACTIVE'`, [assetId,fileId]);
  return result.rows[0] || null;
}

async function recordDownload(pool, userId, file, trace) {
  await pool.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
    VALUES($1,'FILE_DOWNLOADED','FILE',$2,$3::jsonb,$4,$5)`,
  [userId,String(file.id),JSON.stringify({assetId:file.asset_id,fileType:file.file_type}),trace.requestId,trace.ip]);
}

async function deactivate(pool, userId, file, trace) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const changed = await client.query(`UPDATE file_records SET status='INACTIVE',deactivated_at=now(),deactivated_by=$1
      WHERE id=$2 AND status='ACTIVE' RETURNING *`, [userId,file.id]);
    if (!changed.rowCount) { await client.query('ROLLBACK'); return null; }
    await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
      VALUES($1,'FILE_DEACTIVATED','FILE',$2,$3::jsonb,$4,$5)`,
    [userId,String(file.id),JSON.stringify({assetId:file.asset_id,fileType:file.file_type}),trace.requestId,trace.ip]);
    await client.query('COMMIT');
    return changed.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = { findAsset, createAssetFile, findActiveAssetFile, recordDownload, deactivate };
