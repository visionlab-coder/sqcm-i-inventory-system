import { createClient } from '@supabase/supabase-js';

const authorizationId = new URLSearchParams(location.search).get('authorization_id');
const card = document.querySelector('#consent-card');
const status = document.querySelector('#status');
const errorBox = document.querySelector('#error');
const loginForm = document.querySelector('#login-form');
const details = document.querySelector('#details');
const approve = document.querySelector('#approve');
const deny = document.querySelector('#deny');
let supabase;

const scopeLabels = { openid:'로그인 식별자', email:'이메일 주소와 확인 상태', profile:'표시 이름과 프로필' };
function fail(message='요청을 처리할 수 없습니다. 처음부터 다시 시도하세요.') { errorBox.textContent=message; errorBox.classList.remove('hidden'); status.textContent='요청 처리 실패'; card.setAttribute('aria-busy','false'); }
function busy(value,message) { approve.disabled=value; deny.disabled=value; const submit=loginForm.querySelector('button'); submit.disabled=value; status.textContent=message; card.setAttribute('aria-busy',String(value)); }
async function showAuthorization() {
  const {data,error}=await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if(error||!data) return fail();
  if(!('authorization_id' in data)) return location.assign(data.redirect_url);
  document.querySelector('#client-name').textContent=data.client?.name||'등록된 애플리케이션';
  const list=document.querySelector('#scopes'); list.replaceChildren();
  String(data.scope||'').split(/\s+/).filter(Boolean).forEach(scope=>{const item=document.createElement('li');item.textContent=scopeLabels[scope]||scope;list.append(item);});
  loginForm.classList.add('hidden'); details.classList.remove('hidden'); busy(false,'요청 내용을 확인한 뒤 승인 또는 거부하세요.');
}
async function decide(action) {
  busy(true,action==='approve'?'승인 처리 중입니다.':'거부 처리 중입니다.');
  const options={skipBrowserRedirect:true};
  const result=action==='approve'?await supabase.auth.oauth.approveAuthorization(authorizationId,options):await supabase.auth.oauth.denyAuthorization(authorizationId,options);
  if(result.error||!result.data?.redirect_url) return fail();
  location.assign(result.data.redirect_url);
}
async function init() {
  if(!authorizationId) return fail('유효한 연결 요청이 없습니다.');
  try { const response=await fetch('/api/auth/oidc/consent-config',{credentials:'same-origin',cache:'no-store'}); if(!response.ok) return fail(); const config=await response.json(); supabase=createClient(config.supabaseUrl,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}); loginForm.classList.remove('hidden'); busy(false,'UAT 계정으로 로그인해 요청 내용을 확인하세요.'); } catch { fail(); }
}
loginForm.addEventListener('submit',async event=>{event.preventDefault();errorBox.classList.add('hidden');busy(true,'로그인 확인 중입니다.');const email=document.querySelector('#email').value.trim();const password=document.querySelector('#password').value;const {error}=await supabase.auth.signInWithPassword({email,password});document.querySelector('#password').value='';if(error){loginForm.classList.remove('hidden');return fail('로그인 정보를 확인할 수 없습니다.');}await showAuthorization();});
approve.addEventListener('click',()=>decide('approve')); deny.addEventListener('click',()=>decide('deny')); init();
