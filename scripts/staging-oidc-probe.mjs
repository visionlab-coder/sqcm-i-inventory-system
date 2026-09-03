import https from 'node:https';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const [envFile = '.env.staging.local', publicHost = 'inventory-staging.safe-link.co.kr', edgeIp] = process.argv.slice(2);
if (!edgeIp) throw new Error('Cloudflare edge IP is required.');

const env = dotenv.parse(fs.readFileSync(envFile));
const required = name => {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

function edgeRequest(path, { method = 'GET', cookie = '', csrfToken = '', body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      host: edgeIp,
      servername: publicHost,
      port: 443,
      path,
      method,
      headers: {
        host: publicHost,
        accept: 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(csrfToken ? { origin: `https://${publicHost}`, 'x-csrf-token': csrfToken } : {}),
        ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {})
      },
      rejectUnauthorized: true
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

function sessionCookie(response) {
  const values = response.headers['set-cookie'] || [];
  return values.map(value => value.split(';', 1)[0]).find(value => value.startsWith('seowon.sid=')) || '';
}

const start = await edgeRequest('/api/auth/oidc/start');
if (start.status !== 302 || !start.headers.location) throw new Error(`OIDC start failed: ${start.status}`);
let cookie = sessionCookie(start);
if (!cookie) throw new Error('OIDC session cookie is missing.');

const authorize = await fetch(start.headers.location, { redirect: 'manual' });
if (authorize.status !== 302) throw new Error(`Supabase authorize failed: ${authorize.status}`);
const consentUrl = new URL(authorize.headers.get('location'));
const authorizationId = consentUrl.searchParams.get('authorization_id');
if (!authorizationId) throw new Error('OAuth authorization ID is missing.');

const client = createClient(required('SUPABASE_URL'), required('SUPABASE_PUBLISHABLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const login = await client.auth.signInWithPassword({
  email: required('STAGING_UAT_ADMIN_EMAIL'),
  password: required('STAGING_UAT_ADMIN_AUTH_PASSWORD')
});
if (login.error) throw login.error;

const details = await client.auth.oauth.getAuthorizationDetails(authorizationId);
if (details.error || !details.data?.redirect_url) throw details.error || new Error('OAuth callback URL is missing.');
const callbackUrl = new URL(details.data.redirect_url);
if (callbackUrl.protocol !== 'https:' || callbackUrl.host !== publicHost || callbackUrl.pathname !== '/api/auth/oidc/callback') {
  throw new Error('OAuth callback target does not match the staging origin.');
}

const callback = await edgeRequest(`${callbackUrl.pathname}${callbackUrl.search}`, { cookie });
if (callback.status !== 302 || callback.headers.location !== '/') throw new Error(`OIDC callback failed: ${callback.status}`);
cookie = sessionCookie(callback) || cookie;

const me = await edgeRequest('/api/auth/me', { cookie });
if (me.status !== 200) throw new Error(`Authenticated session probe failed: ${me.status}`);
const identity = JSON.parse(me.body);
if (identity.user?.role !== 'ADMIN' || !identity.csrfToken) throw new Error('Expected ADMIN session was not established.');

const logout = await edgeRequest('/api/auth/logout', { method: 'POST', cookie, csrfToken: identity.csrfToken, body: '{}' });
if (logout.status !== 204) throw new Error(`Logout cleanup failed: ${logout.status}`);

console.log(JSON.stringify({
  status: 'PASS',
  oidcStart: start.status,
  supabaseAuthorize: authorize.status,
  callback: callback.status,
  authenticatedRole: identity.user.role,
  logout: logout.status,
  tlsVerified: true,
  secretsPrinted: false
}));
