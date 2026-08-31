const test = require('node:test');
const assert = require('node:assert/strict');
const { createSupabaseS3FileStore, safeKey } = require('../../src/adapters/supabase-s3-file-store');
const { createSupabaseOidcProvider, pkcePair } = require('../../src/adapters/supabase-oidc-provider');
const { createHttpEventPublisher } = require('../../src/adapters/http-event-publisher');

test('Supabase S3 adapter는 private object write/read/remove/health 계약을 지킨다', async () => {
  const calls=[];
  const client={async send(command){calls.push(command.constructor.name);if(command.constructor.name==='GetObjectCommand')return{Body:{async transformToByteArray(){return Uint8Array.from([1,2,3]);}}};return{};}};
  const store=createSupabaseS3FileStore({storageS3Endpoint:'https://project.storage.supabase.co/storage/v1/s3',storageS3Region:'ap-southeast-1',storageBucket:'inventory-staging',storageS3AccessKeyId:'id',storageS3SecretAccessKey:'secret'},client);
  await store.healthCheck(); await store.write('1/2026/08/a.png',Buffer.from([1]));
  assert.deepEqual(await store.read('1/2026/08/a.png'),Buffer.from([1,2,3]));
  await store.removeNew('1/2026/08/a.png');
  assert.deepEqual(calls,['HeadBucketCommand','PutObjectCommand','GetObjectCommand','DeleteObjectCommand']);
  assert.throws(()=>safeKey('../secret.txt'),/invalid/);
});

test('Supabase OIDC adapter는 exact callback·PKCE·nonce 검증 계약을 사용한다', async () => {
  const issuer='https://project.supabase.co/auth/v1';
  const fetchImpl=async(url,options={})=>{
    if(String(url).includes('openid-configuration'))return{ok:true,json:async()=>({issuer,authorization_endpoint:`${issuer}/oauth/authorize`,token_endpoint:`${issuer}/oauth/token`,jwks_uri:`${issuer}/.well-known/jwks.json`})};
    assert.match(String(options.body),/code_verifier=verifier/);
    assert.match(options.headers.authorization,/^Basic /);
    return{ok:true,status:200,json:async()=>({id_token:'signed'})};
  };
  const provider=createSupabaseOidcProvider({oidcIssuer:issuer,oidcClientId:'client',oidcClientSecret:'secret'},{fetchImpl,verifyIdToken:async(_token,{nonce})=>({iss:issuer,sub:'subject',email:'user@example.com',email_verified:true,nonce})});
  const pair=pkcePair(); assert.notEqual(pair.verifier,pair.challenge);
  const url=new URL(await provider.authorizationUrl({state:'state',nonce:'nonce',redirectUri:'https://inventory.example/api/auth/oidc/callback',codeChallenge:pair.challenge}));
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('scope'),'openid email profile');
  const claims=await provider.exchangeCode({code:'code',nonce:'nonce',redirectUri:'https://inventory.example/api/auth/oidc/callback',codeVerifier:'verifier'});
  assert.equal(claims.emailVerified,true);
  assert.equal((await provider.healthCheck()).pkce,true);
});

test('HTTPS event publisher는 receipt를 요구한다', async () => {
  const publisher=createHttpEventPublisher({eventPublisherUrl:'https://inventory.example/internal/providers/events/publish',eventPublisherApiKey:'secret'},async(_url,options)=>({ok:true,status:options.method==='POST'?202:200,json:async()=>({receiptId:'receipt-1'})}));
  assert.deepEqual(await publisher.publish({id:'1'}),{id:'receipt-1'});
  assert.equal((await publisher.healthCheck()).status,'ok');
});

test('staging event publisher는 인증된 내부 loopback HTTP만 허용한다', async () => {
  const publisher=createHttpEventPublisher({env:'staging',eventPublisherUrl:'http://host.docker.internal:18766/events/publish',eventPublisherApiKey:'secret'},async()=>({ok:true,status:200}));
  assert.deepEqual(await publisher.healthCheck(),{status:'ok',driver:'HTTP_LOOPBACK'});
  assert.throws(()=>createHttpEventPublisher({env:'production',eventPublisherUrl:'http://host.docker.internal:18766/events/publish',eventPublisherApiKey:'secret'}),/loopback HTTP only/);
  assert.throws(()=>createHttpEventPublisher({env:'staging',eventPublisherUrl:'http://inventory.example/events/publish',eventPublisherApiKey:'secret'}),/loopback HTTP only/);
});
