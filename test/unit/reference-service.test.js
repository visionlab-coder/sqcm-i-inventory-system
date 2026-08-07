const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeKind,normalizeCreate,normalizeUpdate}=require('../../src/services/reference-service');

test('기준정보 유형은 허용된 4종만 사용한다',()=>{
  assert.equal(normalizeKind(' Categories '),'categories');
  assert.throws(()=>normalizeKind('statuses'),error=>error.status===404);
});

test('자산 유형과 위치 생성 입력을 정규화한다',()=>{
  assert.deepEqual(normalizeCreate('categories',{code:' field-2 ',name:' 현장 장비 ',parentId:'3'}),{kind:'categories',code:'FIELD-2',name:'현장 장비',parentId:3});
  assert.deepEqual(normalizeCreate('locations',{code:' wh-2 ',name:' 제2 창고 ',locationType:'warehouse'}),{kind:'locations',code:'WH-2',name:'제2 창고',parentId:null,locationType:'WAREHOUSE'});
});

test('모델 사양 JSON과 공급업체 이메일을 검증한다',()=>{
  assert.deepEqual(normalizeCreate('models',{categoryId:'4',brand:'Bosch',name:' GSH 18V ',specification:'{"voltage":"18V"}'}),{kind:'models',categoryId:4,brand:'Bosch',name:'GSH 18V',specification:{voltage:'18V'}});
  assert.throws(()=>normalizeCreate('models',{categoryId:4,brand:'Bosch',name:'GSH',specification:'{bad'}),error=>error.fieldErrors[0].field==='specification');
  assert.throws(()=>normalizeCreate('vendors',{code:'V-2',name:'공급 업체',contactEmail:'bad'}),error=>error.fieldErrors[0].field==='contactEmail');
});

test('기준정보 수정은 명칭과 boolean 활성 상태를 요구한다',()=>{
  assert.deepEqual(normalizeUpdate('vendors',{name:' 새 공급업체 ',isActive:false}),{kind:'vendors',name:'새 공급업체',isActive:false});
  assert.throws(()=>normalizeUpdate('vendors',{name:'새 공급업체',isActive:'false'}),error=>error.fieldErrors[0].field==='isActive');
  assert.throws(()=>normalizeUpdate('vendors',{name:'',isActive:true}),error=>error.fieldErrors[0].field==='name');
});
