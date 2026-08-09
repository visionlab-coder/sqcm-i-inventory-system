const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeReturnPayload } = require('../../src/services/return-service');
const { normalizeUpload } = require('../../src/services/file-service');

const png=Buffer.from([137,80,78,71,13,10,26,10,0]);

test('반납 상태·메모·부속품을 정규화하고 중복 부속품을 제거한다', () => {
  assert.deepEqual(normalizeReturnPayload({conditionCode:' good ',note:' 정상 반납 ',accessories:['충전기',' 케이스 ','충전기']}),{conditionCode:'GOOD',note:'정상 반납',accessories:['충전기','케이스']});
  assert.deepEqual(normalizeReturnPayload({returnCondition:'damaged',returnNote:'외관 파손',accessories:'충전기, 케이스'}),{conditionCode:'DAMAGED',note:'외관 파손',accessories:['충전기','케이스']});
});

test('손상·부속품 누락은 메모를 요구하고 부속품 경계를 검증한다', () => {
  assert.throws(()=>normalizeReturnPayload({conditionCode:'DAMAGED'}),error=>error.status===400);
  assert.throws(()=>normalizeReturnPayload({conditionCode:'UNKNOWN'}),error=>error.status===400);
  assert.throws(()=>normalizeReturnPayload({conditionCode:'GOOD',accessories:Array.from({length:21},(_,i)=>String(i))}),error=>error.status===400);
});

test('반납 증빙은 JPEG·PNG만 허용한다', () => {
  assert.equal(normalizeUpload({content:png,contentType:'image/png',originalName:'return.png',fileType:'RETURN'},1024).fileType,'RETURN');
  assert.throws(()=>normalizeUpload({content:Buffer.from('%PDF-x'),contentType:'application/pdf',originalName:'return.pdf',fileType:'RETURN'},1024),error=>error.status===415);
});
