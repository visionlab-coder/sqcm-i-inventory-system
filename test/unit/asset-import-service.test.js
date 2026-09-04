const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_IMPORT_ROWS,
  parseCsv,
  canonicalHeaders,
  analyzeAssetImport,
  commitAssetImport,
  safeSpreadsheetCsvCell,
  assetImportTemplate
} = require('../../src/services/asset-import-service');

const user = { id: 1, role: 'ADMIN', organizationId: 7, departmentId: 11, isSystemAdmin: false };

function fakeDatabase(existing = []) {
  return {
    async query(sql) {
      if (sql.includes('FROM departments WHERE')) return { rows: [{ id: 11, code: 'HQ' }] };
      if (sql.includes('FROM locations WHERE')) return { rows: [{ id: 21, code: 'SEOUL-HQ' }] };
      if (sql.includes('FROM item_categories WHERE')) return { rows: [{ id: 31, code: 'IT' }] };
      if (sql.includes('FROM user_role_scopes')) return { rows: [{ scope_type: 'ORGANIZATION', organization_id: 7, department_id: null }] };
      if (sql.includes('FROM assets')) return { rows: existing };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
}

test('CSV 파서는 따옴표·쉼표·줄바꿈과 UTF-8 BOM을 보존한다', () => {
  assert.deepEqual(parseCsv('\ufeff자산번호,자산명\r\nSW-001,"노트북, 15인치"\r\n'), [
    ['자산번호', '자산명'],
    ['SW-001', '노트북, 15인치']
  ]);
  assert.throws(() => parseCsv('자산번호,자산명\nSW-001,"닫히지 않음'), error => error.code === 'ASSET_IMPORT_CSV_INVALID');
});

test('CSV 파서는 500행 상한과 중복·미지원 헤더를 fail-closed한다', () => {
  const tooMany = ['자산번호,자산명', ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => `SW-${index + 1000},자산 ${index}`)].join('\n');
  assert.throws(() => parseCsv(tooMany), /최대 500개/);
  assert.throws(() => canonicalHeaders(['자산번호', 'asset_tag', '자산명']), /두 번/);
  assert.throws(() => canonicalHeaders(['자산번호', '임의열']), /지원하지 않는 열/);
  assert.equal(parseCsv('자산번호,자산명\nSW-001,노트북,예상외열')[1].length, 3);
});

test('자산 대량등록 미리보기는 기준정보를 ID로 결박하고 정상 행을 정규화한다', async () => {
  const csv = '자산번호,자산명,제조번호,상태,부서코드,위치코드,분류코드,취득일,취득금액\nSW-IT-9001,업무용 노트북,SN-9001,available,HQ,SEOUL-HQ,IT,2026-09-04,"1,500,000"';
  const preview = await analyzeAssetImport(fakeDatabase(), user, csv);
  assert.deepEqual(preview.summary, { total: 1, valid: 1, invalid: 0 });
  assert.match(preview.checksum, /^[a-f0-9]{64}$/);
  assert.deepEqual(preview.rows[0].values, {
    assetTag: 'SW-IT-9001', name: '업무용 노트북', serialNo: 'SN-9001', statusCode: 'AVAILABLE',
    departmentId: 11, locationId: 21, categoryId: 31, acquiredAt: '2026-09-04', acquisitionCost: '1500000.00'
  });
});

test('행별 중복·기존 원장·잘못된 기준정보·수식 입력을 등록 전에 함께 표시한다', async () => {
  const csv = [
    '자산번호,자산명,제조번호,상태,부서코드,위치코드,분류코드',
    'SW-IT-9001,=위험수식,SN-1,IN_USE,UNKNOWN,SEOUL-HQ,IT',
    'SW-IT-9001,정상 자산,SN-1,AVAILABLE,HQ,SEOUL-HQ,IT'
  ].join('\n');
  const preview = await analyzeAssetImport(fakeDatabase([{ asset_tag: 'SW-IT-9001', serial_no: 'SN-1' }]), user, csv);
  assert.deepEqual(preview.summary, { total: 2, valid: 0, invalid: 2 });
  const messages = preview.rows.flatMap(row => row.errors.map(error => error.message));
  assert.ok(messages.some(message => message.includes('수식')));
  assert.ok(messages.some(message => message.includes('DRAFT 또는 AVAILABLE')));
  assert.ok(messages.some(message => message.includes('기준정보')));
  assert.ok(messages.some(message => message.includes('파일 안에서 자산번호')));
  assert.ok(messages.some(message => message.includes('이미 등록된 자산번호')));
});

test('헤더보다 많은 열과 네 가지 스프레드시트 수식 시작 문자를 행 오류로 차단한다', async () => {
  for (const prefix of ['=', '+', '-', '@']) {
    const preview = await analyzeAssetImport(fakeDatabase(), user, `자산번호,자산명\nSW-${prefix.codePointAt(0)},${prefix}위험,예상외열`);
    assert.equal(preview.summary.invalid, 1);
    assert.ok(preview.rows[0].errors.some(error => error.field === 'row'));
    assert.ok(preview.rows[0].errors.some(error => error.message.includes('수식')));
  }
});

test('다운로드 템플릿은 Excel 호환 한국어 헤더와 안전한 예시를 제공한다', () => {
  const template = assetImportTemplate();
  assert.match(template, /^"자산번호","자산명"/);
  assert.match(template, /"SW-IT-0001"/);
  assert.doesNotMatch(template, /password|token|secret/i);
});

test('CSV 출력은 스프레드시트 수식 실행 문자를 데이터로 중화한다', () => {
  for (const value of ['=CMD()', '+SUM(1,1)', '-2+3', '@IMPORT']) {
    assert.equal(safeSpreadsheetCsvCell(value).startsWith(`"'`), true);
  }
  assert.equal(safeSpreadsheetCsvCell('정상 "자산"'), '"정상 ""자산"""');
});

function transactionalPool() {
  const queries = []; let nextId = 900;
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('FROM departments WHERE')) return { rows: [{ id: 11, code: 'HQ' }] };
      if (sql.includes('FROM locations WHERE')) return { rows: [{ id: 21, code: 'SEOUL-HQ' }] };
      if (sql.includes('FROM item_categories WHERE')) return { rows: [{ id: 31, code: 'IT' }] };
      if (sql.includes('FROM user_role_scopes')) return { rows: [{ scope_type: 'ORGANIZATION', organization_id: 7 }] };
      if (sql.includes('SELECT upper(asset_tag)')) return { rows: [] };
      if (sql.includes('INSERT INTO assets')) return { rows: [{ id: nextId++, asset_tag: params[1], name: params[3], status_code: params[5] }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() { queries.push({ sql: 'RELEASE', params: [] }); }
  };
  return { queries, connect: async () => client };
}

test('확정 등록은 checksum 재검증 후 자산·이력·감사·outbox를 한 트랜잭션으로 기록한다', async () => {
  const csv = '자산번호,자산명,상태,부서코드,위치코드,분류코드\nSW-IT-9101,업무용 노트북,AVAILABLE,HQ,SEOUL-HQ,IT';
  const preview = await analyzeAssetImport(fakeDatabase(), user, csv);
  const pool = transactionalPool();
  const result = await commitAssetImport(pool, user, csv, preview.checksum, { requestId: 'req-1', ip: '127.0.0.1', idempotencyKey: 'import-key-1' });
  assert.equal(result.imported, 1);
  assert.ok(pool.queries.some(query => query.sql === 'BEGIN'));
  assert.ok(pool.queries.some(query => query.sql.includes('pg_advisory_xact_lock')));
  assert.ok(pool.queries.some(query => query.sql.includes('asset_status_histories')));
  assert.ok(pool.queries.some(query => query.sql.includes("'ASSET_IMPORTED'")));
  assert.ok(pool.queries.some(query => query.sql.includes("'ASSET_BULK_IMPORTED'")));
  assert.ok(pool.queries.some(query => query.sql.includes('outbox_events')));
  assert.ok(pool.queries.some(query => query.sql === 'COMMIT'));
  assert.ok(!pool.queries.some(query => query.sql === 'ROLLBACK'));
});

test('미리보기 checksum이 다르면 자산 INSERT 전에 전체 트랜잭션을 롤백한다', async () => {
  const pool = transactionalPool();
  await assert.rejects(() => commitAssetImport(pool, user, '자산번호,자산명\nSW-IT-9102,업무용 모니터', '0'.repeat(64)), error => error.code === 'ASSET_IMPORT_CSV_INVALID');
  assert.ok(pool.queries.some(query => query.sql === 'ROLLBACK'));
  assert.ok(!pool.queries.some(query => query.sql.includes('INSERT INTO assets')));
  assert.ok(!pool.queries.some(query => query.sql === 'COMMIT'));
});
