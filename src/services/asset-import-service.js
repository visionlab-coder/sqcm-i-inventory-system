const crypto = require('node:crypto');
const { DomainError } = require('./inventory-service');
const { requirePermission, requireOrganization } = require('./enterprise-service');
const { resolveScope, canAccessDepartment } = require('./scope-service');

const MAX_IMPORT_BYTES = 512 * 1024;
const MAX_IMPORT_ROWS = 500;
const ALLOWED_IMPORT_STATUSES = new Set(['DRAFT', 'AVAILABLE']);

const COLUMN_ALIASES = new Map([
  ['자산번호', 'assetTag'], ['assettag', 'assetTag'], ['asset_tag', 'assetTag'],
  ['자산명', 'name'], ['name', 'name'],
  ['제조번호', 'serialNo'], ['serialno', 'serialNo'], ['serial_no', 'serialNo'],
  ['상태', 'statusCode'], ['statuscode', 'statusCode'], ['status_code', 'statusCode'],
  ['부서코드', 'departmentCode'], ['departmentcode', 'departmentCode'], ['department_code', 'departmentCode'],
  ['위치코드', 'locationCode'], ['locationcode', 'locationCode'], ['location_code', 'locationCode'],
  ['분류코드', 'categoryCode'], ['categorycode', 'categoryCode'], ['category_code', 'categoryCode'],
  ['취득일', 'acquiredAt'], ['acquiredat', 'acquiredAt'], ['acquired_at', 'acquiredAt'],
  ['취득금액', 'acquisitionCost'], ['acquisitioncost', 'acquisitionCost'], ['acquisition_cost', 'acquisitionCost']
]);

const TEMPLATE = [
  ['자산번호', '자산명', '제조번호', '상태', '부서코드', '위치코드', '분류코드', '취득일', '취득금액'],
  ['SW-IT-0001', '업무용 노트북', 'SERIAL-EXAMPLE-001', 'AVAILABLE', 'HQ', 'SEOUL-HQ', 'IT', '2026-09-04', '1500000']
];

function csvError(message) {
  const error = new DomainError(message, 400);
  error.code = 'ASSET_IMPORT_CSV_INVALID';
  return error;
}

function parseCsv(csv) {
  if (typeof csv !== 'string') throw csvError('CSV 파일을 UTF-8 텍스트로 전송하세요.');
  const bytes = Buffer.byteLength(csv, 'utf8');
  if (!bytes || bytes > MAX_IMPORT_BYTES) throw csvError(`CSV 파일은 1바이트 이상 ${MAX_IMPORT_BYTES / 1024}KiB 이하여야 합니다.`);
  const source = csv.replace(/^\uFEFF/, '');
  if (source.includes('\0')) throw csvError('CSV 파일에 허용되지 않는 NUL 문자가 있습니다.');

  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (quoted) throw csvError('CSV 따옴표가 닫히지 않았습니다.');
  row.push(field.replace(/\r$/, '')); rows.push(row);
  while (rows.length && rows.at(-1).every(value => String(value).trim() === '')) rows.pop();
  if (rows.length < 2) throw csvError('헤더와 자산 데이터 1행 이상이 필요합니다.');
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw csvError(`한 번에 최대 ${MAX_IMPORT_ROWS}개 자산을 등록할 수 있습니다.`);
  return rows;
}

function canonicalHeaders(headerRow) {
  const headers = headerRow.map(value => COLUMN_ALIASES.get(String(value).trim().toLowerCase()) || null);
  if (headers.includes(null)) {
    const unknown = headerRow.filter((_value, index) => !headers[index]).map(value => String(value).trim()).filter(Boolean);
    throw csvError(`지원하지 않는 열이 있습니다: ${unknown.join(', ') || '빈 열'}`);
  }
  if (new Set(headers).size !== headers.length) throw csvError('같은 의미의 열이 두 번 포함되어 있습니다.');
  for (const required of ['assetTag', 'name']) if (!headers.includes(required)) throw csvError(`필수 열이 없습니다: ${required === 'assetTag' ? '자산번호' : '자산명'}`);
  return headers;
}

function exactDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function normalizeCost(value) {
  const text = String(value || '').trim().replaceAll(',', '');
  if (!text) return { value: null };
  if (!/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/.test(text)) return { error: '취득금액은 0 이상, 소수 둘째 자리 이하의 숫자여야 합니다.' };
  return { value: Number(text).toFixed(2) };
}

function spreadsheetFormula(value) {
  return /^[\t\r\n]*[=+@-]/.test(String(value || ''));
}

function pushError(errors, field, message) { errors.push({ field, message }); }

async function referenceMaps(db, organizationId) {
  const [departments, locations, categories] = await Promise.all([
    db.query("SELECT id,upper(code) code FROM departments WHERE organization_id=$1 AND status='ACTIVE'", [organizationId]),
    db.query("SELECT id,upper(code) code FROM locations WHERE organization_id=$1 AND status='ACTIVE'", [organizationId]),
    db.query('SELECT id,upper(code) code FROM item_categories WHERE organization_id=$1 AND is_active=true', [organizationId])
  ]);
  return {
    departmentCode: new Map(departments.rows.map(row => [row.code, Number(row.id)])),
    locationCode: new Map(locations.rows.map(row => [row.code, Number(row.id)])),
    categoryCode: new Map(categories.rows.map(row => [row.code, Number(row.id)]))
  };
}

function resolveReference(row, field, map, errors) {
  const code = String(row[field] || '').trim().toUpperCase();
  if (!code) return null;
  const id = map.get(code);
  if (!id) pushError(errors, field, `활성 기준정보에서 ${code} 코드를 찾을 수 없습니다.`);
  return id || null;
}

async function analyzeAssetImport(db, user, csv) {
  requirePermission(user, 'asset.create');
  const organizationId = requireOrganization(user, user.organizationId);
  const parsed = parseCsv(csv);
  const headers = canonicalHeaders(parsed[0]);
  const references = await referenceMaps(db, organizationId);
  const scope = await resolveScope(db, user);
  const seenTags = new Set(); const seenSerials = new Set();

  const rows = parsed.slice(1).map((values, index) => {
    const source = Object.fromEntries(headers.map((header, column) => [header, String(values[column] ?? '').trim()]));
    const errors = [];
    if (values.length > headers.length) pushError(errors, 'row', '헤더보다 많은 열이 있습니다. 셀 안의 쉼표는 Excel CSV 따옴표 형식으로 저장하세요.');
    const assetTag = source.assetTag.toUpperCase(); const name = source.name;
    const serialNo = String(source.serialNo || '').trim(); const statusCode = String(source.statusCode || 'AVAILABLE').trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,50}$/.test(assetTag)) pushError(errors, 'assetTag', '자산번호는 영문 대문자·숫자·하이픈 3~50자로 입력하세요.');
    if (name.length < 2 || name.length > 150) pushError(errors, 'name', '자산명은 2~150자로 입력하세요.');
    if (spreadsheetFormula(name)) pushError(errors, 'name', '수식으로 해석될 수 있는 =, +, -, @ 시작 값은 허용하지 않습니다.');
    if (spreadsheetFormula(serialNo)) pushError(errors, 'serialNo', '수식으로 해석될 수 있는 =, +, -, @ 시작 값은 허용하지 않습니다.');
    if (serialNo.length > 100) pushError(errors, 'serialNo', '제조번호는 100자 이하여야 합니다.');
    if (!ALLOWED_IMPORT_STATUSES.has(statusCode)) pushError(errors, 'statusCode', '대량등록 상태는 DRAFT 또는 AVAILABLE만 허용됩니다.');
    const acquiredAtText = String(source.acquiredAt || '').trim();
    const acquiredAt = acquiredAtText ? exactDate(acquiredAtText) : null;
    if (acquiredAtText && !acquiredAt) pushError(errors, 'acquiredAt', '취득일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.');
    const cost = normalizeCost(source.acquisitionCost);
    if (cost.error) pushError(errors, 'acquisitionCost', cost.error);
    if (seenTags.has(assetTag)) pushError(errors, 'assetTag', '파일 안에서 자산번호가 중복됩니다.');
    if (assetTag) seenTags.add(assetTag);
    const serialKey = serialNo.toUpperCase();
    if (serialKey && seenSerials.has(serialKey)) pushError(errors, 'serialNo', '파일 안에서 제조번호가 중복됩니다.');
    if (serialKey) seenSerials.add(serialKey);
    const departmentId = resolveReference(source, 'departmentCode', references.departmentCode, errors);
    const locationId = resolveReference(source, 'locationCode', references.locationCode, errors);
    const categoryId = resolveReference(source, 'categoryCode', references.categoryCode, errors);
    if (departmentId && !canAccessDepartment(scope, departmentId)) pushError(errors, 'departmentCode', '허용된 부서 범위를 벗어났습니다.');
    return { rowNumber: index + 2, values: { assetTag, name, serialNo: serialNo || null, statusCode, departmentId, locationId, categoryId, acquiredAt, acquisitionCost: cost.value ?? null }, errors };
  });

  const tags = [...seenTags].filter(Boolean); const serials = [...seenSerials].filter(Boolean);
  const existing = await db.query(`SELECT upper(asset_tag) asset_tag,upper(serial_no) serial_no FROM assets
    WHERE organization_id=$1 AND (upper(asset_tag)=ANY($2::text[]) OR upper(COALESCE(serial_no,''))=ANY($3::text[]))`, [organizationId, tags, serials]);
  const existingTags = new Set(existing.rows.map(row => row.asset_tag).filter(Boolean));
  const existingSerials = new Set(existing.rows.map(row => row.serial_no).filter(Boolean));
  for (const row of rows) {
    if (existingTags.has(row.values.assetTag)) pushError(row.errors, 'assetTag', '이미 등록된 자산번호입니다.');
    if (row.values.serialNo && existingSerials.has(row.values.serialNo.toUpperCase())) pushError(row.errors, 'serialNo', '이미 등록된 제조번호입니다.');
  }
  const valid = rows.filter(row => row.errors.length === 0).length;
  return { organizationId, checksum: crypto.createHash('sha256').update(csv, 'utf8').digest('hex'), summary: { total: rows.length, valid, invalid: rows.length - valid }, rows };
}

async function commitAssetImport(pool, user, csv, expectedChecksum, trace = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const preview = await analyzeAssetImport(client, user, csv);
    if (!/^[a-f0-9]{64}$/.test(String(expectedChecksum || '')) || preview.checksum !== expectedChecksum) {
      throw csvError('미리보기 이후 파일이 변경되었습니다. 다시 미리보기를 실행하세요.');
    }
    if (preview.summary.invalid) {
      const error = new DomainError('오류가 있는 행은 등록할 수 없습니다. 미리보기 결과를 수정하세요.', 400);
      error.code = 'ASSET_IMPORT_VALIDATION_FAILED';
      error.fieldErrors = preview.rows.flatMap(row => row.errors.map(item => ({ field: `row.${row.rowNumber}.${item.field}`, message: item.message }))).slice(0, 100);
      throw error;
    }
    await client.query('SELECT pg_advisory_xact_lock($1,$2)', [9142, preview.organizationId]);
    const assets = [];
    for (const row of preview.rows) {
      const value = row.values;
      const inserted = await client.query(`INSERT INTO assets(organization_id,asset_tag,serial_no,name,category_id,status_code,location_id,department_id,acquired_at,acquisition_cost,attributes,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'{}'::jsonb,$11) RETURNING id,asset_tag,name,status_code`,
      [preview.organizationId, value.assetTag, value.serialNo, value.name, value.categoryId, value.statusCode, value.locationId, value.departmentId, value.acquiredAt, value.acquisitionCost, user.id]);
      const asset = inserted.rows[0]; assets.push(asset);
      await client.query(`INSERT INTO asset_status_histories(asset_id,from_status,to_status,reason,changed_by,request_id)
        VALUES($1,NULL,$2,'엑셀 대량등록',$3,$4)`, [asset.id, value.statusCode, user.id, trace.requestId || null]);
      await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
        VALUES($1,'ASSET_IMPORTED','ASSET',$2,$3::jsonb,$4,$5)`, [user.id, String(asset.id), JSON.stringify({ assetTag: asset.asset_tag, importChecksum: preview.checksum }), trace.requestId || null, trace.ip || null]);
      await client.query(`INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
        VALUES('ASSET',$1,'ASSET_CREATED',$2::jsonb,$3) ON CONFLICT(idempotency_key) DO NOTHING`, [String(asset.id), JSON.stringify({ assetTag: asset.asset_tag, source: 'BULK_IMPORT' }), trace.idempotencyKey ? `${trace.idempotencyKey}:${asset.asset_tag}`.slice(0, 100) : null]);
    }
    await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
      VALUES($1,'ASSET_BULK_IMPORTED','ASSET_IMPORT',$2,$3::jsonb,$4,$5)`, [user.id, preview.checksum, JSON.stringify({ count: assets.length, checksum: preview.checksum }), trace.requestId || null, trace.ip || null]);
    await client.query('COMMIT');
    return { checksum: preview.checksum, imported: assets.length, assets };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new DomainError('등록 중 자산번호 또는 제조번호 중복이 발견되었습니다. 다시 미리보기를 실행하세요.', 409);
    throw error;
  } finally { client.release(); }
}

function safeSpreadsheetCsvCell(value) {
  let text = String(value ?? '');
  if (/^[\t\r\n]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function assetImportTemplate() { return TEMPLATE.map(row => row.map(safeSpreadsheetCsvCell).join(',')).join('\r\n'); }

module.exports = { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, ALLOWED_IMPORT_STATUSES, parseCsv, canonicalHeaders, analyzeAssetImport, commitAssetImport, safeSpreadsheetCsvCell, assetImportTemplate };
