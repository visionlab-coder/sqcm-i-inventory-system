const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { unzipSync } = require('fflate');
const { buildAssetExport } = require('../../src/services/asset-report-export-service');

const assets = [{ asset_tag:'SW-100', name:'업무용 노트북', serial_no:'SN-100', status_code:'IN_USE', department_name:'미래전략TF', location_name:'서울', category_name:'IT', acquired_at:'2026-09-09', acquisition_cost:'1500000' }];

test('Excel·Word·PPT 내보내기는 유효한 OOXML ZIP과 한국어 자산 내용을 만든다', async () => {
  for (const format of ['xlsx','docx','pptx']) {
    const result = await buildAssetExport(format, assets);
    assert.equal(result.content.subarray(0,2).toString('ascii'), 'PK');
    const files = unzipSync(new Uint8Array(result.content));
    assert.ok(files['[Content_Types].xml']);
    assert.ok(Object.values(files).some(value => Buffer.from(value).toString('utf8').includes('업무용 노트북')));
  }
});

test('PNG·JPEG 내보내기는 실제 이미지이며 자산 수를 보존한다', async () => {
  for (const format of ['png','jpeg']) {
    const result = await buildAssetExport(format, assets);
    const metadata = await sharp(result.content).metadata();
    assert.equal(metadata.format, format === 'jpeg' ? 'jpeg' : 'png');
    assert.equal(result.rows, 1);
    assert.ok(metadata.width > 1000 && metadata.height > 100);
  }
});

test('미지원 형식은 생성하지 않는다', async () => {
  await assert.rejects(() => buildAssetExport('exe', assets), /xlsx, docx, pptx, png, jpeg/);
});
