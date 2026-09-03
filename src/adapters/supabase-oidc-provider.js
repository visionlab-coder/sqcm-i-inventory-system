const crypto = require('node:crypto');

function required(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function createSupabaseOidcProvider(config, { fetchImpl = fetch, verifyIdToken = null } = {}) {
  const issuer = required(config.oidcIssuer, 'OIDC_ISSUER').replace(/\/$/, '');
  const clientId = required(config.oidcClientId, 'OIDC_CLIENT_ID');
  const clientSecret = required(config.oidcClientSecret, 'OIDC_CLIENT_SECRET');
  if (!/^https:\/\//i.test(issuer)) throw new Error('OIDC issuer must use HTTPS.');
  let discoveryPromise;
  let jwks;

  async function discovery() {
    discoveryPromise ||= fetchImpl(`${issuer}/.well-known/openid-configuration`, { headers: { accept: 'application/json' } })
      .then(async response => {
        if (!response.ok) throw new Error(`OIDC discovery HTTP ${response.status}.`);
        const document = await response.json();
        if (document.issuer !== issuer || !document.authorization_endpoint || !document.token_endpoint || !document.jwks_uri) {
          throw new Error('OIDC discovery contract mismatch.');
        }
        return document;
      });
    return discoveryPromise;
  }

  async function authorizationUrl({ state, nonce, redirectUri, codeChallenge }) {
    const document = await discovery();
    const url = new URL(document.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: required(redirectUri, 'OIDC redirect URI'),
      response_type: 'code',
      scope: 'openid email profile',
      state: required(state, 'OIDC state'),
      nonce: required(nonce, 'OIDC nonce'),
      code_challenge: required(codeChallenge, 'OIDC PKCE challenge'),
      code_challenge_method: 'S256'
    });
    return url.toString();
  }

  async function defaultVerify(idToken, document, nonce) {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    jwks ||= createRemoteJWKSet(new URL(document.jwks_uri));
    const result = await jwtVerify(idToken, jwks, { issuer, audience: clientId, clockTolerance: 5 });
    if (result.payload.nonce !== nonce) throw new Error('OIDC nonce mismatch.');
    return result.payload;
  }

  async function exchangeCode({ code, nonce, redirectUri, codeVerifier }) {
    const document = await discovery();
    const response = await fetchImpl(document.token_endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: required(code, 'OIDC authorization code'),
        redirect_uri: required(redirectUri, 'OIDC redirect URI'),
        code_verifier: required(codeVerifier, 'OIDC PKCE verifier')
      })
    });
    const token = await response.json().catch(() => null);
    if (!response.ok || !token?.id_token) throw new Error(`OIDC token exchange HTTP ${response.status}.`);
    const claims = verifyIdToken
      ? await verifyIdToken(token.id_token, { issuer, clientId, nonce, discovery: document })
      : await defaultVerify(token.id_token, document, nonce);
    return {
      issuer: claims.iss,
      subject: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true
    };
  }

  async function healthCheck() {
    const document = await discovery();
    return { status: 'ok', issuer: document.issuer, pkce: true };
  }

  return { authorizationUrl, exchangeCode, healthCheck };
}

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}

module.exports = { createSupabaseOidcProvider, pkcePair };
