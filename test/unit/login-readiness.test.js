const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('CSRF 준비 실패는 로그인 전송을 막고 다음 제출에서 새 토큰으로 복구한다',async()=>{
  const source=fs.readFileSync('frontend/app.js','utf8');
  const handlers={}; const tokens=[];let csrfCalls=0;let reject;
  const pending=new Promise((_resolve,no)=>reject=no);
  const state={csrfToken:'old',user:{}};
  const node={classList:{add(){},remove(){}},reset(){}};
  const context=vm.createContext({state,$:selector=>({...node,addEventListener:(_event,fn)=>handlers[selector]=fn}),
    FormData:class{* [Symbol.iterator](){yield ['email','synthetic'];}},showLogin(){},showApp(){},showRequiredPasswordChange(){},
    request:async path=>{if(path==='/api/auth/csrf')return ++csrfCalls===1?pending:{csrfToken:'fresh'};if(path==='/api/auth/login'){tokens.push(state.csrfToken);return {user:{},csrfToken:'authenticated'};}}
  });
  vm.runInContext('let loginReadiness=null;'+source.slice(source.indexOf("$('#login-form').addEventListener"),source.indexOf("$('#mfa-login-form').addEventListener"))+source.slice(source.indexOf("$('#logout-button').addEventListener"),source.indexOf("if('serviceWorker'")),context);
  const logout=handlers['#logout-button']();await new Promise(resolve=>setImmediate(resolve));
  const event={preventDefault(){},target:node};
  const first=handlers['#login-form'](event);reject(new Error('synthetic offline'));await logout;await first;
  assert.deepEqual(tokens,[]);assert.equal(state.csrfToken,null);
  await handlers['#login-form'](event);
  assert.deepEqual(tokens,['fresh']);assert.equal(csrfCalls,2);
});
test('logout 후 재로그인은 새 CSRF가 준비될 때까지 전송하지 않는다',async()=>{
  const source=fs.readFileSync('frontend/app.js','utf8');
  const handlers={}; const calls=[]; let release;
  const csrf=new Promise(resolve=>release=resolve);
  const node={classList:{add(){},remove(){}},reset(){}};
  const context=vm.createContext({state:{csrfToken:'old',user:{}},$:selector=>({...node,addEventListener:(_event,fn)=>handlers[selector]=fn}),
    FormData:class{* [Symbol.iterator](){yield ['email','synthetic'];}},
    showLogin(){},showApp(){},showRequiredPasswordChange(){},
    request:async(path)=>{calls.push(path);if(path==='/api/auth/csrf')return csrf;if(path==='/api/auth/login')return {user:{},csrfToken:'new'};}
  });
  vm.runInContext('let loginReadiness=null;'+source.slice(source.indexOf("$('#login-form').addEventListener"),source.indexOf("$('#mfa-login-form').addEventListener"))+source.slice(source.indexOf("$('#logout-button').addEventListener"),source.indexOf("if('serviceWorker'")),context);
  const logout=handlers['#logout-button'](); await new Promise(resolve=>setImmediate(resolve));
  const login=handlers['#login-form']({preventDefault(){},target:node});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.filter(path=>path==='/api/auth/login').length,0);
  release({csrfToken:'fresh'});await logout;await login;
  assert.equal(calls.filter(path=>path==='/api/auth/login').length,1);
});
