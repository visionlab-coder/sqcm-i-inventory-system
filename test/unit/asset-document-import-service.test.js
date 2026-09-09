const test = require('node:test');
const assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate');
const {
  rowsFromText, rowsFromOoxml, inspectZip, analyzeAssetDocument, commitAssetDocument, validateSource
} = require('../../src/services/asset-document-import-service');
const { buildXlsx, buildDocx } = require('../../src/services/asset-report-export-service');

const user = { id: 1, role: 'ADMIN', organizationId: 7, departmentId: 11, isSystemAdmin: false };
const csv = '자산번호,자산명,상태,부서코드,위치코드,분류코드\nSW-DOC-001,문서 자산,AVAILABLE,HQ,SEOUL-HQ,IT';

function db() {
  return { async query(sql) {
    if (sql.includes('FROM departments WHERE')) return { rows: [{ id: 11, code: 'HQ' }] };
    if (sql.includes('FROM locations WHERE')) return { rows: [{ id: 21, code: 'SEOUL-HQ' }] };
    if (sql.includes('FROM item_categories WHERE')) return { rows: [{ id: 31, code: 'IT' }] };
    if (sql.includes('FROM user_role_scopes')) return { rows: [{ scope_type: 'ORGANIZATION', organization_id: 7 }] };
    if (sql.includes('SELECT upper(asset_tag)')) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  } };
}

const scanner = { async scan(content) { assert.ok(Buffer.isBuffer(content)); return { status: 'clean' }; } };

test('TXT 탭 표와 Markdown 표를 동일한 자산 행으로 정규화한다', () => {
  assert.deepEqual(rowsFromText(Buffer.from('자산번호\t자산명\nSW-1\t노트북'), '.txt'), [['자산번호','자산명'],['SW-1','노트북']]);
  assert.deepEqual(rowsFromText(Buffer.from('| 자산번호 | 자산명 |\n|---|---|\n| SW-2 | 모니터 |'), '.md'), [['자산번호','자산명'],['SW-2','모니터']]);
});

test('시스템이 만든 XLSX와 DOCX 표를 다시 읽어 자산 행을 보존한다', () => {
  const assets = [{ asset_tag:'SW-3', name:'태블릿', status_code:'AVAILABLE' }];
  const xlsx = buildXlsx([['자산번호','자산명'],['SW-3','태블릿']]);
  const docx = buildDocx([['자산번호','자산명'],['SW-3','태블릿']]);
  assert.deepEqual(rowsFromOoxml(xlsx, '.xlsx'), [['자산번호','자산명'],['SW-3','태블릿']]);
  assert.deepEqual(rowsFromOoxml(docx, '.docx'), [['자산번호','자산명'],['SW-3','태블릿']]);
  assert.equal(assets[0].name, '태블릿');
});

test('ZIP central directory에서 경로 이탈과 과도한 항목을 fail-closed한다', () => {
  const safe = Buffer.from(zipSync({ 'assets.csv': strToU8(csv) }));
  assert.equal(inspectZip(safe).entries, 1);
  const traversal = Buffer.from(zipSync({ '../outside.csv': strToU8(csv) }));
  assert.throws(() => inspectZip(traversal), /안전하지 않은 경로/);
});

test('다중 문서 미리보기는 악성코드 검사 후 기존 자산 검증 계약을 재사용한다', async () => {
  const result = await analyzeAssetDocument({ db: db(), user, content: Buffer.from(csv), contentType:'text/csv', originalName:'assets.csv', malwareScanner:scanner });
  assert.equal(result.document.extraction, 'DETERMINISTIC');
  assert.deepEqual(result.preview.summary, { total:1, valid:1, invalid:0 });
  assert.match(result.sourceChecksum, /^[a-f0-9]{64}$/);
});

test('문서 확정은 원본·변환 checksum을 다시 결박한 뒤 기존 원자적 등록을 호출한다', async () => {
  const queries = []; let id = 100;
  const pool = {
    async query(sql) { return db().query(sql); },
    async connect() { return { async query(sql, params = []) {
      queries.push(sql);
      if (sql.includes('FROM departments WHERE')) return { rows:[{id:11,code:'HQ'}] };
      if (sql.includes('FROM locations WHERE')) return { rows:[{id:21,code:'SEOUL-HQ'}] };
      if (sql.includes('FROM item_categories WHERE')) return { rows:[{id:31,code:'IT'}] };
      if (sql.includes('FROM user_role_scopes')) return { rows:[{scope_type:'ORGANIZATION',organization_id:7}] };
      if (sql.includes('SELECT upper(asset_tag)')) return { rows:[] };
      if (sql.includes('INSERT INTO assets')) return { rows:[{id:id++,asset_tag:params[1],name:params[3],status_code:params[5]}],rowCount:1 };
      return { rows:[],rowCount:1 };
    }, release() {} }; }
  };
  const options = { db:pool, pool, user, content:Buffer.from(csv), contentType:'text/csv', originalName:'assets.csv', malwareScanner:scanner };
  const preview = await analyzeAssetDocument(options);
  const result = await commitAssetDocument(options, { sourceChecksum:preview.sourceChecksum, importChecksum:preview.preview.checksum }, { requestId:'doc-import' });
  assert.equal(result.imported, 1);
  assert.ok(queries.includes('COMMIT'));
  await assert.rejects(() => commitAssetDocument(options, { sourceChecksum:'0'.repeat(64), importChecksum:preview.preview.checksum }), /변경되었습니다/);
});

test('PNG/PDF/레거시 문서는 구조화 OCR 결과만 자산표로 승격한다', async () => {
  const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
  const aiProvider = { ocr:{ async extract(input) {
    assert.equal(input.schema, 'asset-import-v1'); assert.ok(input.contentBase64);
    return { rows:[{ assetTag:'SW-OCR-1', name:'OCR 노트북', statusCode:'AVAILABLE', departmentCode:'HQ', locationCode:'SEOUL-HQ', categoryCode:'IT' }] };
  } } };
  const result = await analyzeAssetDocument({ db:db(), user, content:png, contentType:'image/png', originalName:'scan.png', malwareScanner:scanner, aiProvider });
  assert.equal(result.document.extraction, 'OCR_STRUCTURED');
  assert.equal(result.preview.summary.valid, 1);
});

test('매크로 문서와 확장자-내용 불일치는 입력 단계에서 차단한다', () => {
  assert.throws(() => validateSource(Buffer.from('PK'), 'assets.xlsm'), /매크로/);
  assert.throws(() => validateSource(Buffer.from('not-a-pdf'), 'assets.pdf'), /일치하지 않습니다/);
});
