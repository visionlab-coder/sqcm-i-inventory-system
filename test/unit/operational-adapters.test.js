const test = require('node:test');
const assert = require('node:assert/strict');
const { validateOperationalAdapters } = require('../../src/adapters/contracts');
const { MockMalwareScanner } = require('../../src/adapters/mock-malware-scanner');

const externalConfig={fileStorageDriver:'external',malwareScanDriver:'external',authProvider:'oidc',outboxPublisherRequired:true};
const externalAdapters={
  fileStore:{driver:'S3_COMPATIBLE',async write(){},async read(){return Buffer.from('ok');},async removeNew(){},async healthCheck(){return{status:'ok'};}},
  malwareScanner:{driver:'ICAP',async scan(){return{status:'clean'};},async healthCheck(){return{status:'ok'};}},
  oidcProvider:{async authorizationUrl(){return'https://idp.example/authorize';},async exchangeCode(){return{};},async healthCheck(){return{status:'ok'};}},
  eventPublisher:{async publish(){return{id:'provider-event'};},async healthCheck(){return{status:'ok'};}}
};

test('주입된 운영 어댑터는 공급자 독립 계약을 충족한다',()=>{
  assert.equal(validateOperationalAdapters(externalConfig,externalAdapters).fileStore.driver,'S3_COMPATIBLE');
});

test('운영 어댑터 누락·local·mock은 fail-closed 된다',()=>{
  assert.throws(()=>validateOperationalAdapters(externalConfig,{}),/fileStore/);
  assert.throws(()=>validateOperationalAdapters(externalConfig,{...externalAdapters,eventPublisher:null}),/eventPublisher/);
  assert.throws(()=>validateOperationalAdapters(externalConfig,{...externalAdapters,fileStore:{...externalAdapters.fileStore,driver:'LOCAL'}}),/LOCAL/);
  assert.throws(()=>validateOperationalAdapters(externalConfig,{...externalAdapters,malwareScanner:new MockMalwareScanner()}),/MOCK/);
});

test('외부 AI provider는 추천·상태·OCR 계약을 요구한다',()=>{
  const config={...externalConfig,aiProviderDriver:'external'};
  assert.throws(()=>validateOperationalAdapters(config,externalAdapters),/aiProvider/);
  const result=validateOperationalAdapters(config,{...externalAdapters,aiProvider:{async recommend(){return{recommendations:[]};},async healthCheck(){return{status:'ok'};},ocr:{async extract(){return{fields:{},confidence:{}};}}}});
  assert.equal(typeof result.aiProvider.recommend,'function');
});

test('mock 스캐너는 staging 계약 테스트에서만 clean 결과를 낸다',async()=>{
  const scanner=new MockMalwareScanner();
  assert.deepEqual(await scanner.scan(Buffer.from('test')),{status:'clean',engine:'contract-mock',signatureVersion:'test-only'});
  assert.equal((await scanner.healthCheck()).status,'ok');
});
