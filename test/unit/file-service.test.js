const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { normalizeUpload, storageKey, requireCleanScan } = require('../../src/services/file-service');
const { LocalFileStore } = require('../../src/storage/local-file-store');

const png = Buffer.from([137,80,78,71,13,10,26,10,0]);

test('증빙 파일의 유형, 서명, 이름, 크기를 검증한다', () => {
  const value = normalizeUpload({ content:png,contentType:'image/png',originalName:'../현장사진.png',fileType:'PHOTO' }, 1024);
  assert.equal(value.originalName,'현장사진.png');
  assert.equal(value.contentType,'image/png');
  assert.throws(()=>normalizeUpload({ content:Buffer.from('not png'),contentType:'image/png',originalName:'x.png',fileType:'PHOTO' },1024),/일치하지/);
  assert.throws(()=>normalizeUpload({ content:png,contentType:'application/zip',originalName:'x.zip',fileType:'PHOTO' },1024),error=>error.status===415);
  assert.throws(()=>normalizeUpload({ content:png,contentType:'image/png',originalName:'x.png',fileType:'OTHER' },1024),/증빙 유형/);
  assert.throws(()=>normalizeUpload({ content:Buffer.concat([png,Buffer.alloc(1024)]),contentType:'image/png',originalName:'x.png',fileType:'PHOTO' },1024),error=>error.status===413);
});

test('저장 키는 조직 범위와 무작위 이름을 사용한다', () => {
  const first=storageKey(7,'png',new Date('2026-08-07T00:00:00Z'));
  const second=storageKey(7,'png',new Date('2026-08-07T00:00:00Z'));
  assert.match(first,/^7\/2026\/08\/[a-f0-9]{40}\.png$/);
  assert.notEqual(first,second);
});

test('로컬 저장소는 루트 밖 경로를 거부한다', () => {
  const store=new LocalFileStore(path.join(os.tmpdir(),'seowon-file-test'));
  assert.throws(()=>store.resolve('../secret.txt'),/Invalid storage key|escaped/);
  assert.match(store.resolve('1/2026/08/abc.png'),/abc\.png$/);
});

test('검사 결과는 clean만 허용하고 infected·unknown·timeout을 저장 전에 거부한다', () => {
  assert.equal(requireCleanScan({ status: 'clean' }).status, 'clean');
  for (const status of ['infected', 'unknown', 'timeout']) {
    assert.throws(() => requireCleanScan({ status }), error => error.status === 422);
  }
});
