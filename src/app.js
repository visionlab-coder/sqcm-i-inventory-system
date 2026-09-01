const path = require('node:path');
const express = require('express');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { DUMMY_HASH, csrfToken, csrfProtection, sameOriginProtection, requireAuth, requireRole, sanitizeUser } = require('./security');
const { createItem, updateItem, deactivateItem, checkoutItem, returnItem } = require('./services/inventory-service');
const { requestContext, requestLogger, auditTrace } = require('./observability');
const { createLoginRateLimiter } = require('./login-rate-limit');
const { createEnterpriseRouter } = require('./enterprise-routes');
const { getAuditLogs } = require('./services/reporting-service');
const { acceptInvitation } = require('./services/organization-service');
const { LocalFileStore } = require('./storage/local-file-store');
const { startMfaSetup, enableMfa, verifyMfaLogin, disableMfa } = require('./services/mfa-service');
const { MockMalwareScanner } = require('./adapters/mock-malware-scanner');
const { validateOperationalAdapters } = require('./adapters/contracts');
const { pkcePair } = require('./adapters/supabase-oidc-provider');

function safeReturnPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

async function writeAudit(pool, actorId, action, entityType = 'AUTH', entityId = null, metadata = {}, trace = {}) {
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata, request_id, ip_address)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [actorId || null, action, entityType, entityId ? String(entityId) : null, JSON.stringify(metadata), trace.requestId || null, trace.ip || null]
  );
}

async function loadScopedUser(pool, userId) {
  const result = await pool.query(`SELECT u.id,u.email,u.display_name,u.role,u.status,u.organization_id,u.department_id,u.employee_no,u.mfa_enabled,u.password_reset_required,u.is_system_admin,
    s.scope_type,s.department_id scope_department_id
    FROM users u LEFT JOIN LATERAL (
      SELECT scope_type,department_id FROM user_role_scopes WHERE user_id=u.id AND role_code=u.role
      ORDER BY CASE scope_type WHEN 'ALL' THEN 4 WHEN 'ORGANIZATION' THEN 3 WHEN 'DEPARTMENT' THEN 2 ELSE 1 END DESC,created_at LIMIT 1
    ) s ON true WHERE u.id=$1 AND u.status='ACTIVE'`, [userId]);
  return result.rows[0] || null;
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function apiError(req, res, status, code, message, fieldErrors = []) {
  return res.status(status).json({ code, message, fieldErrors, requestId: req.id });
}

function requiresMfaEnrollment(config, user) {
  return config.localAuthMfaRequired === true && user?.mfa_enabled !== true;
}

function createApp({ pool, config, fileStore, malwareScanner, oidcProvider, aiProvider }) {
  fileStore ||= new LocalFileStore(config.fileStorageRoot);
  malwareScanner ||= config.malwareScanDriver === 'mock' ? new MockMalwareScanner() : null;
  validateOperationalAdapters(config,{ fileStore,malwareScanner,oidcProvider,aiProvider });
  const app = express();
  const PgSession = connectPgSimple(session);
  const loginRateLimit = createLoginRateLimiter({
    maxAttempts: config.loginRateLimitMax,
    windowMs: config.loginRateLimitWindowMs
  });
  if (config.cookieSecure) app.set('trust proxy', config.trustedProxyCount);
  app.set('view engine', 'ejs');
  app.set('views', path.join(process.cwd(), 'src', 'views'));
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(requestLogger());
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'], fontSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"]
  } } }));
  app.use(express.json({ limit: '50kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(express.static(path.join(process.cwd(), 'src', 'public'), { maxAge: config.env === 'production' ? '1d' : 0 }));
  // 상태 엔드포인트는 세션 미들웨어보다 앞에 두어 health probe가 DB 세션을 만들지 않게 한다.
  app.get('/health', async (_req, res) => {
    try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'up' }); }
    catch (_error) { res.status(503).json({ status: 'error', database: 'down' }); }
  });
  app.get('/api/health', async (_req, res) => {
    try { await pool.query('SELECT 1'); res.json({ status: 'ok', service: 'backend', database: 'up' }); }
    catch (_error) { res.status(503).json({ status: 'error', service: 'backend', database: 'down' }); }
  });
  app.get('/api/readiness', async (_req,res)=>{
    try{
      await pool.query('SELECT 1');
      const dependencies={ storage:await fileStore.healthCheck(),malware:await malwareScanner.healthCheck() };
      if(oidcProvider) dependencies.oidc=await oidcProvider.healthCheck();
      if(Object.values(dependencies).some(item=>item?.status!=='ok')) throw new Error('dependency not ready');
      res.json({status:'ok',service:'backend',database:'up',dependencies});
    }catch(_error){res.status(503).json({status:'error',service:'backend'});}
  });
  app.use(session({
    store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: false }),
    name: 'seowon.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 8 * 60 * 60 * 1000 }
  }));

  app.use(async (req, res, next) => {
    try {
      req.user = null;
      if (req.session.userId) {
        req.user = sanitizeUser(await loadScopedUser(pool, req.session.userId));
        if (!req.user) delete req.session.userId;
      }
      const flash = req.session.flash;
      delete req.session.flash;
      res.locals.currentUser = req.user;
      // JSON API와 health 요청은 세션이 필요한 엔드포인트에서만 토큰을 만든다.
      // 공통 미들웨어에서 토큰을 만들면 익명 health 요청마다 세션 행이 누적된다.
      res.locals.csrfToken = req.path.startsWith('/api/') ? null : csrfToken(req);
      res.locals.flash = flash;
      res.locals.path = req.path;
      next();
    } catch (error) {
      next(error);
    }
  });
  app.use(sameOriginProtection({ publicBaseUrl: config.publicBaseUrl, enforce: config.env === 'production' }));
  app.use(csrfProtection);

  // ------------------------------------------------------------------
  // JSON API: frontend 컨테이너가 같은 출처의 /api 경로로 호출한다.
  // 인증 쿠키는 HttpOnly로 유지하고 모든 변경 요청은 세션 CSRF 토큰을 검사한다.
  // ------------------------------------------------------------------
  const apiAuth = (req, res, next) => req.user
    ? next()
    : apiError(req, res, 401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
  const apiRole = (...roles) => (req, res, next) => {
    if (!req.user) return apiError(req, res, 401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
    if (!roles.includes(req.user.role)) return apiError(req, res, 403, 'FORBIDDEN', '권한이 없습니다.');
    next();
  };

  const requireRecentReauth = (req, res, next) => {
    const reauthenticatedAt = Number(req.session.reauthenticatedAt || 0);
    if (!reauthenticatedAt || Date.now() - reauthenticatedAt > 10 * 60 * 1000) {
      return apiError(req, res, 403, 'REAUTH_REQUIRED', '민감한 관리자 작업 전에 비밀번호를 다시 확인하세요.');
    }
    if (req.user?.mfaEnabled) {
      const verifiedAt = Number(req.session.mfaVerifiedAt || 0);
      if (!verifiedAt || Date.now() - verifiedAt > 10 * 60 * 1000) {
        return apiError(req, res, 403, 'MFA_REAUTH_REQUIRED', '민감한 관리자 작업 전에 MFA를 다시 확인하세요.');
      }
    }
    next();
  };

  app.use('/api/enterprise', createEnterpriseRouter({ pool, apiAuth, requireRecentReauth, isProduction: config.env === 'production', fileStore, malwareScanner, fileMaxBytes: config.fileMaxBytes, aiProvider }));

  app.get('/api/auth/csrf', (req, res) => res.json({ csrfToken: csrfToken(req) }));
  app.get('/api/auth/config', (_req,res)=>res.json({ authProvider:config.authProvider }));
  app.get('/api/auth/oidc/consent-config', (req,res) => {
    res.set('Cache-Control','no-store');
    if(config.authProvider !== 'oidc') return apiError(req,res,404,'OIDC_DISABLED','SSO 로그인이 활성화되지 않았습니다.');
    res.json({ supabaseUrl:config.supabaseUrl, publishableKey:config.supabasePublishableKey });
  });
  app.get('/api/auth/me', apiAuth, (req, res) => res.json({ user: req.user, csrfToken: csrfToken(req) }));

  app.get('/api/auth/oidc/start', async (req,res) => {
    if(config.authProvider !== 'oidc') return apiError(req,res,404,'OIDC_DISABLED','SSO 로그인이 활성화되지 않았습니다.');
    const state=crypto.randomBytes(32).toString('hex'); const nonce=crypto.randomBytes(32).toString('hex');
    const pkce=pkcePair();
    req.session.oidc={ state,nonce,codeVerifier:pkce.verifier,issuedAt:Date.now(),returnTo:safeReturnPath(req.query.returnTo) };
    res.redirect(await oidcProvider.authorizationUrl({state,nonce,redirectUri:config.oidcRedirectUri,codeChallenge:pkce.challenge}));
  });

  app.get('/api/auth/oidc/callback', async (req,res) => {
    const pending=req.session.oidc; delete req.session.oidc;
    if(config.authProvider !== 'oidc'||!pending||pending.state!==req.query.state||Date.now()-pending.issuedAt>5*60*1000) {
      return apiError(req,res,401,'OIDC_STATE_INVALID','SSO 인증 상태가 유효하지 않습니다.');
    }
    const claims=await oidcProvider.exchangeCode({code:String(req.query.code||''),nonce:pending.nonce,redirectUri:config.oidcRedirectUri,codeVerifier:pending.codeVerifier});
    if(!claims?.issuer||!claims?.subject||!claims?.email||claims.emailVerified!==true) return apiError(req,res,401,'OIDC_CLAIMS_INVALID','SSO 사용자 정보가 유효하지 않습니다.');
    let found=await pool.query(`SELECT u.* FROM user_oidc_identities i JOIN users u ON u.id=i.user_id WHERE i.issuer=$1 AND i.subject=$2`,[claims.issuer,claims.subject]);
    if(!found.rowCount&&config.oidcAllowEmailLinking){
      const client=await pool.connect();
      try{await client.query('BEGIN');found=await client.query("SELECT * FROM users WHERE lower(email)=lower($1) AND status='ACTIVE' FOR UPDATE",[claims.email]);if(found.rowCount){const linked=await client.query('INSERT INTO user_oidc_identities(user_id,issuer,subject) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING user_id',[found.rows[0].id,claims.issuer,claims.subject]);if(!linked.rowCount)throw new Error('OIDC identity linking conflict.');}await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    }
    const user=found.rows[0]; if(!user||user.status!=='ACTIVE') return apiError(req,res,403,'OIDC_USER_NOT_PROVISIONED','등록된 활성 SSO 사용자가 아닙니다.');
    await new Promise((resolve,reject)=>req.session.regenerate(error=>error?reject(error):resolve()));
    req.session.csrfToken=crypto.randomBytes(32).toString('hex');
    if(user.mfa_enabled){req.session.pendingMfaUserId=user.id;req.session.pendingMfaIssuedAt=Date.now();await writeAudit(pool,user.id,'MFA_CHALLENGE_ISSUED','AUTH',user.id,{source:'oidc'},auditTrace(req));return res.redirect('/?mfa=required');}
    req.session.userId=user.id; req.session.reauthenticatedAt=Date.now(); await pool.query('UPDATE users SET last_login_at=now() WHERE id=$1',[user.id]);
    await writeAudit(pool,user.id,'OIDC_LOGIN_SUCCEEDED','AUTH',user.id,{issuer:claims.issuer},auditTrace(req));
    res.redirect(pending.returnTo);
  });

  app.post('/api/auth/login', loginRateLimit, async (req, res) => {
    if(config.authProvider==='oidc') return apiError(req,res,403,'LOCAL_LOGIN_DISABLED','회사 SSO로 로그인하세요.');
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const result = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [email]);
    const user = result.rows[0];
    const locked = user?.locked_until && new Date(user.locked_until) > new Date();
    const valid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);

    if (!user || !valid || locked || user.status !== 'ACTIVE') {
      if (user && !locked) {
        await pool.query(
          `UPDATE users SET failed_login_count = failed_login_count + 1,
           locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
           WHERE id = $1`,
          [user.id]
        );
      }
      await writeAudit(pool, user?.id, 'LOGIN_FAILED', 'AUTH', user?.id, { reason: locked ? 'locked' : 'invalid' }, auditTrace(req));
      return apiError(req, res, 401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인하세요.');
    }

    if (requiresMfaEnrollment(config, user)) {
      await writeAudit(pool, user.id, 'LOGIN_BLOCKED_MFA_ENROLLMENT_REQUIRED', 'AUTH', user.id, {}, auditTrace(req));
      return apiError(req, res, 403, 'MFA_ENROLLMENT_REQUIRED', '운영 로그인 전에 MFA 등록이 필요합니다. 관리자에게 문의하세요.');
    }

    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.csrfToken = require('node:crypto').randomBytes(32).toString('hex');
    if (user.mfa_enabled) {
      req.session.pendingMfaUserId = user.id;
      req.session.pendingMfaIssuedAt = Date.now();
      await writeAudit(pool, user.id, 'MFA_CHALLENGE_ISSUED', 'AUTH', user.id, {}, auditTrace(req));
      return res.status(202).json({ code: 'MFA_REQUIRED', mfaRequired: true, csrfToken: req.session.csrfToken });
    }
    req.session.userId = user.id; loginRateLimit.clear(req);
    await pool.query('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
    await writeAudit(pool, user.id, 'LOGIN_SUCCEEDED', 'AUTH', user.id, { mfa: false }, auditTrace(req));
    res.json({ user: sanitizeUser(await loadScopedUser(pool, user.id)), csrfToken: req.session.csrfToken });
  });

  app.post('/api/auth/mfa/verify', async (req, res) => {
    const pendingUserId = Number(req.session.pendingMfaUserId || 0);
    const issuedAt = Number(req.session.pendingMfaIssuedAt || 0);
    if (!pendingUserId || !issuedAt || Date.now() - issuedAt > 5 * 60 * 1000) {
      delete req.session.pendingMfaUserId; delete req.session.pendingMfaIssuedAt;
      return apiError(req, res, 401, 'MFA_CHALLENGE_EXPIRED', 'MFA 인증 시간이 만료되었습니다. 다시 로그인하세요.');
    }
    const user = await verifyMfaLogin(pool, pendingUserId, req.body.code, config.mfaEncryptionKey, auditTrace(req));
    if (!user) return apiError(req, res, 401, 'INVALID_MFA_CODE', '인증 코드가 올바르지 않습니다.');
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.userId = user.id; req.session.mfaVerifiedAt = Date.now(); req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE users SET failed_login_count=0,locked_until=NULL,last_login_at=now() WHERE id=$1', [user.id]);
    await writeAudit(pool, user.id, 'LOGIN_SUCCEEDED', 'AUTH', user.id, { mfa: true }, auditTrace(req));
    res.json({ user: sanitizeUser(await loadScopedUser(pool, user.id)), csrfToken: req.session.csrfToken });
  });

  app.post('/api/auth/mfa/setup', apiAuth, requireRecentReauth, async (req, res) => {
    res.json(await startMfaSetup(pool, req.user, config.mfaEncryptionKey, auditTrace(req)));
  });

  app.post('/api/auth/mfa/enable', apiAuth, async (req, res) => {
    const result = await enableMfa(pool, req.user, req.body.code, config.mfaEncryptionKey, auditTrace(req));
    req.session.mfaVerifiedAt = Date.now(); res.json(result);
  });

  app.post('/api/auth/mfa/disable', apiAuth, requireRecentReauth, async (req, res) => {
    await disableMfa(pool, req.user, req.body.code, config.mfaEncryptionKey, auditTrace(req));
    delete req.session.mfaVerifiedAt; res.status(204).end();
  });

  app.post('/api/auth/logout', apiAuth, async (req, res, next) => {
    const userId = req.user.id;
    try {
      await writeAudit(pool, userId, 'LOGOUT', 'AUTH', userId, {}, auditTrace(req));
      req.session.destroy(error => error ? next(error) : res.status(204).end());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/reauth', apiAuth, async (req, res) => {
    const result = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    const valid = await bcrypt.compare(String(req.body.password || ''), result.rows[0]?.password_hash || DUMMY_HASH);
    if (!valid) {
      await writeAudit(pool, req.user.id, 'REAUTH_FAILED', 'AUTH', req.user.id, {}, auditTrace(req));
      return apiError(req, res, 401, 'INVALID_CREDENTIALS', '비밀번호를 확인하세요.');
    }
    req.session.reauthenticatedAt = Date.now();
    await writeAudit(pool, req.user.id, 'REAUTH_SUCCEEDED', 'AUTH', req.user.id, {}, auditTrace(req));
    res.status(204).end();
  });

  app.post('/api/auth/password-reset/request', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const found = await pool.query("SELECT id FROM users WHERE lower(email)=$1 AND status='ACTIVE'", [email]);
    let developmentToken;
    if (found.rowCount) {
      const raw = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      await pool.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [found.rows[0].id]);
      await pool.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')", [found.rows[0].id, hash]);
      await writeAudit(pool, found.rows[0].id, 'PASSWORD_RESET_REQUESTED', 'AUTH', found.rows[0].id, {}, auditTrace(req));
      if (config.env !== 'production') developmentToken = raw;
    }
    res.json({ message: '계정이 존재하면 비밀번호 재설정 안내가 발급됩니다.', ...(developmentToken ? { developmentToken } : {}) });
  });

  app.post('/api/auth/password-reset/confirm', async (req, res) => {
    const tokenHash = crypto.createHash('sha256').update(String(req.body.token || '')).digest('hex');
    const password = String(req.body.newPassword || '');
    if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return apiError(req, res, 400, 'VALIDATION_ERROR', '비밀번호는 12자 이상이며 대문자·소문자·숫자·특수문자를 포함해야 합니다.', [{ field: 'newPassword' }]);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE', [tokenHash]);
      if (!found.rowCount) { await client.query('ROLLBACK'); return apiError(req, res, 400, 'INVALID_TOKEN', '유효하지 않거나 만료된 재설정 토큰입니다.'); }
      const userId = found.rows[0].user_id; const passwordHash = await bcrypt.hash(password, 12);
      await client.query('UPDATE users SET password_hash=$1,password_reset_required=false,failed_login_count=0,locked_until=NULL,updated_at=now() WHERE id=$2', [passwordHash, userId]);
      await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1', [found.rows[0].id]);
      await client.query("DELETE FROM user_sessions WHERE (sess->>'userId')::bigint=$1", [userId]);
      await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address) VALUES($1,'PASSWORD_RESET_COMPLETED','AUTH',$2,'{}'::jsonb,$3,$4)`, [userId, String(userId), req.id, req.ip]);
      await client.query('COMMIT'); res.status(204).end();
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });

  app.post('/api/auth/invitations/accept', loginRateLimit, async (req, res) => {
    const user = await acceptInvitation(pool, req.body.token, req.body.newPassword, auditTrace(req));
    res.status(201).json({ user: sanitizeUser(user), message: '계정 활성화를 완료했습니다. 로그인하세요.' });
  });

  app.get('/api/dashboard', apiAuth, async (req, res) => {
    const organizationId = Number(req.user.organizationId);
    if (!Number.isInteger(organizationId) || organizationId <= 0) return apiError(req, res, 403, 'ORG_SCOPE_REQUIRED', '조직 범위가 지정된 사용자만 조회할 수 있습니다.');
    const [counts, items, loans] = await Promise.all([
      pool.query(`SELECT
        (SELECT count(*) FROM items WHERE organization_id=$1 AND status = 'ACTIVE')::int AS total_items,
        (SELECT COALESCE(sum(quantity), 0) FROM loans WHERE organization_id=$1 AND returned_at IS NULL)::int AS loaned,
        (SELECT count(*) FROM loans WHERE organization_id=$1 AND returned_at IS NULL AND due_at < now())::int AS overdue,
        (SELECT count(*) FROM items WHERE organization_id=$1 AND status = 'ACTIVE' AND available_quantity <= min_quantity)::int AS low_stock`, [organizationId]),
      pool.query("SELECT * FROM items WHERE organization_id=$1 AND status = 'ACTIVE' ORDER BY (available_quantity <= min_quantity) DESC, updated_at DESC LIMIT 8", [organizationId]),
      pool.query(`SELECT l.*, i.code, i.name AS item_name, u.display_name AS borrower_name
                  FROM loans l JOIN items i ON i.id=l.item_id JOIN users u ON u.id=l.user_id
                  WHERE l.organization_id=$1 AND i.organization_id=$1 AND u.organization_id=$1 AND l.returned_at IS NULL ORDER BY l.due_at ASC LIMIT 8`, [organizationId])
    ]);
    res.json({ stats: counts.rows[0], items: items.rows, loans: loans.rows });
  });

  app.get('/api/items', apiAuth, async (req, res) => {
    const query = String(req.query.q || '').trim();
    const status = String(req.query.status || 'ALL');
    const organizationId = Number(req.user.organizationId);
    if (!Number.isInteger(organizationId) || organizationId <= 0) return apiError(req, res, 403, 'ORG_SCOPE_REQUIRED', '조직 범위가 지정된 사용자만 조회할 수 있습니다.');
    const values = [organizationId];
    const where = ["organization_id = $1", "status = 'ACTIVE'"];
    if (query) {
      values.push(`%${query}%`);
      where.push(`(code ILIKE $${values.length} OR name ILIKE $${values.length} OR category ILIKE $${values.length})`);
    }
    if (status === 'LOW') where.push('available_quantity <= min_quantity');
    if (status === 'AVAILABLE') where.push('available_quantity > 0');
    const result = await pool.query(`SELECT * FROM items WHERE ${where.join(' AND ')} ORDER BY name LIMIT 50`, values);
    res.json({ items: result.rows });
  });

  app.post('/api/items', apiRole('MANAGER', 'ADMIN'), async (req, res) => {
    const item = await createItem(pool, req.user.id, req.body, auditTrace(req));
    res.status(201).json({ item });
  });

  app.get('/api/items/:id', apiAuth, async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return apiError(req, res, 404, 'NOT_FOUND', '비품을 찾을 수 없습니다.');
    const organizationId = Number(req.user.organizationId);
    const itemResult = await pool.query('SELECT * FROM items WHERE id=$1 AND organization_id=$2', [req.params.id, organizationId]);
    if (!itemResult.rowCount) return apiError(req, res, 404, 'NOT_FOUND', '비품을 찾을 수 없습니다.');
    const loanResult = await pool.query(
      `SELECT l.id, l.quantity, l.loaned_at, l.due_at, l.returned_at, l.return_condition,
              u.display_name AS borrower_name
       FROM loans l JOIN users u ON u.id=l.user_id
       WHERE l.item_id=$1 AND l.organization_id=$2 AND u.organization_id=$2 ORDER BY l.loaned_at DESC LIMIT 20`,
      [req.params.id, organizationId]
    );
    res.json({ item: itemResult.rows[0], loans: loanResult.rows });
  });

  app.patch('/api/items/:id', apiRole('MANAGER', 'ADMIN'), async (req, res) => {
    const item = await updateItem(pool, req.user.id, req.params.id, req.body, auditTrace(req));
    res.json({ item });
  });

  app.delete('/api/items/:id', apiRole('MANAGER', 'ADMIN'), async (req, res) => {
    await deactivateItem(pool, req.user.id, req.params.id, auditTrace(req));
    res.status(204).end();
  });

  app.get('/api/loans', apiAuth, async (req, res) => {
    const manager = ['MANAGER', 'ADMIN'].includes(req.user.role);
    const organizationId = Number(req.user.organizationId);
    const params = manager ? [organizationId] : [organizationId, req.user.id];
    const scope = manager ? 'WHERE l.organization_id = $1 AND i.organization_id = $1 AND u.organization_id = $1' : 'WHERE l.organization_id = $1 AND i.organization_id = $1 AND u.organization_id = $1 AND l.user_id = $2';
    const [loans, items, users] = await Promise.all([
      pool.query(`SELECT l.*, i.code, i.name AS item_name, u.email, u.display_name AS borrower_name,
                         (l.returned_at IS NULL AND l.due_at < now()) AS overdue
                  FROM loans l JOIN items i ON i.id=l.item_id JOIN users u ON u.id=l.user_id
                  ${scope} ORDER BY (l.returned_at IS NULL) DESC, l.due_at DESC LIMIT 100`, params),
      pool.query("SELECT id, code, name, available_quantity FROM items WHERE organization_id=$1 AND status='ACTIVE' AND available_quantity > 0 ORDER BY name", [organizationId]),
      manager ? pool.query("SELECT email, display_name FROM users WHERE organization_id=$1 AND status='ACTIVE' ORDER BY display_name", [organizationId]) : Promise.resolve({ rows: [] })
    ]);
    res.json({ loans: loans.rows, items: items.rows, users: users.rows, manager });
  });

  app.post('/api/loans', apiRole('MANAGER', 'ADMIN'), async (req, res) => {
    const loan = await checkoutItem(pool, req.user.id, req.body, auditTrace(req));
    res.status(201).json({ loan });
  });

  app.post('/api/loans/:id/return', apiRole('MANAGER', 'ADMIN'), async (req, res) => {
    await returnItem(pool, req.user.id, req.params.id, req.body, auditTrace(req));
    res.status(204).end();
  });

  app.get('/api/audit', apiRole('ADMIN'), async (req, res) => {
    res.json(await getAuditLogs(pool, req.query, req.user));
  });

  app.get('/login', (req, res) => {
    if (req.user) return res.redirect('/');
    res.render('login', { title: '로그인', reason: req.query.reason || '', returnTo: safeReturnPath(req.query.returnTo) });
  });

  app.post('/login', loginRateLimit, async (req, res) => {
    if(config.authProvider==='oidc') return res.redirect('/api/auth/oidc/start');
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const result = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [email]);
    const user = result.rows[0];
    const locked = user?.locked_until && new Date(user.locked_until) > new Date();
    const valid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);

    if (!user || !valid || locked || user.status !== 'ACTIVE') {
      if (user && !locked) {
        await pool.query(
          `UPDATE users SET failed_login_count = failed_login_count + 1,
           locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
           WHERE id = $1`,
          [user.id]
        );
      }
      await writeAudit(pool, user?.id, 'LOGIN_FAILED', 'AUTH', user?.id, { reason: locked ? 'locked' : 'invalid' }, auditTrace(req));
      return res.status(401).render('login', {
        title: '로그인', reason: 'invalid', returnTo: safeReturnPath(req.body.returnTo),
        flash: { type: 'error', message: '이메일 또는 비밀번호를 확인하세요.' }
      });
    }

    if (requiresMfaEnrollment(config, user)) {
      await writeAudit(pool, user.id, 'LOGIN_BLOCKED_MFA_ENROLLMENT_REQUIRED', 'AUTH', user.id, {}, auditTrace(req));
      return res.status(403).render('login', {
        title: '로그인', reason: 'mfa_enrollment_required', returnTo: safeReturnPath(req.body.returnTo),
        flash: { type: 'error', message: '운영 로그인 전에 MFA 등록이 필요합니다. 관리자에게 문의하세요.' }
      });
    }

    if (user.mfa_enabled) {
      await writeAudit(pool, user.id, 'MFA_HTML_LOGIN_BLOCKED', 'AUTH', user.id, {}, auditTrace(req));
      return res.status(409).render('login', {
        title: '로그인', reason: 'mfa_required', returnTo: safeReturnPath(req.body.returnTo),
        flash: { type: 'error', message: 'MFA가 활성화된 계정은 메인 비품관리 로그인 화면을 사용하세요.' }
      });
    }

    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.userId = user.id;
    req.session.csrfToken = require('node:crypto').randomBytes(32).toString('hex');
    loginRateLimit.clear(req);
    await pool.query('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
    await writeAudit(pool, user.id, 'LOGIN_SUCCEEDED', 'AUTH', user.id, {}, auditTrace(req));
    res.redirect(safeReturnPath(req.body.returnTo));
  });

  app.post('/logout', requireAuth, async (req, res, next) => {
    const userId = req.user.id;
    try {
      await writeAudit(pool, userId, 'LOGOUT', 'AUTH', userId, {}, auditTrace(req));
      req.session.destroy(error => error ? next(error) : res.redirect('/login'));
    } catch (error) {
      next(error);
    }
  });

  app.get('/', requireAuth, async (req, res) => {
    const organizationId = Number(req.user.organizationId);
    const [counts, items, loans] = await Promise.all([
      pool.query(`SELECT
        (SELECT count(*) FROM items WHERE organization_id=$1 AND status = 'ACTIVE')::int AS total_items,
        (SELECT COALESCE(sum(quantity), 0) FROM loans WHERE organization_id=$1 AND returned_at IS NULL)::int AS loaned,
        (SELECT count(*) FROM loans WHERE organization_id=$1 AND returned_at IS NULL AND due_at < now())::int AS overdue,
        (SELECT count(*) FROM items WHERE organization_id=$1 AND status = 'ACTIVE' AND available_quantity <= min_quantity)::int AS low_stock`, [organizationId]),
      pool.query("SELECT * FROM items WHERE organization_id=$1 AND status = 'ACTIVE' ORDER BY (available_quantity <= min_quantity) DESC, updated_at DESC LIMIT 8", [organizationId]),
      pool.query(`SELECT l.*, i.code, i.name AS item_name, u.display_name AS borrower_name
                  FROM loans l JOIN items i ON i.id=l.item_id JOIN users u ON u.id=l.user_id
                  WHERE l.organization_id=$1 AND i.organization_id=$1 AND u.organization_id=$1 AND l.returned_at IS NULL ORDER BY l.due_at ASC LIMIT 8`, [organizationId])
    ]);
    res.render('dashboard', { title: '대시보드', stats: counts.rows[0], items: items.rows, loans: loans.rows });
  });

  app.get('/items', requireAuth, async (req, res) => {
    const query = String(req.query.q || '').trim();
    const status = String(req.query.status || 'ALL');
    const organizationId = Number(req.user.organizationId);
    const values = [organizationId];
    const where = ["organization_id = $1", "status = 'ACTIVE'"];
    if (query) {
      values.push(`%${query}%`);
      where.push(`(code ILIKE $${values.length} OR name ILIKE $${values.length} OR category ILIKE $${values.length})`);
    }
    if (status === 'LOW') where.push('available_quantity <= min_quantity');
    if (status === 'AVAILABLE') where.push('available_quantity > 0');
    const result = await pool.query(`SELECT * FROM items WHERE ${where.join(' AND ')} ORDER BY name LIMIT 50`, values);
    res.render('items', { title: '비품 관리', items: result.rows, query, status });
  });

  app.post('/items', requireRole('MANAGER', 'ADMIN'), async (req, res) => {
    await createItem(pool, req.user.id, req.body, auditTrace(req));
    setFlash(req, 'success', '비품을 등록했습니다.');
    res.redirect('/items');
  });

  app.get('/loans', requireAuth, async (req, res) => {
    const manager = ['MANAGER', 'ADMIN'].includes(req.user.role);
    const organizationId = Number(req.user.organizationId);
    const params = manager ? [organizationId] : [organizationId, req.user.id];
    const scope = manager ? 'WHERE l.organization_id = $1 AND i.organization_id = $1 AND u.organization_id = $1' : 'WHERE l.organization_id = $1 AND i.organization_id = $1 AND u.organization_id = $1 AND l.user_id = $2';
    const [loans, items, users] = await Promise.all([
      pool.query(`SELECT l.*, i.code, i.name AS item_name, u.email, u.display_name AS borrower_name,
                         (l.returned_at IS NULL AND l.due_at < now()) AS overdue
                  FROM loans l JOIN items i ON i.id=l.item_id JOIN users u ON u.id=l.user_id
                  ${scope} ORDER BY (l.returned_at IS NULL) DESC, l.due_at DESC LIMIT 100`, params),
      pool.query("SELECT id, code, name, available_quantity FROM items WHERE organization_id=$1 AND status='ACTIVE' AND available_quantity > 0 ORDER BY name", [organizationId]),
      manager ? pool.query("SELECT email, display_name FROM users WHERE organization_id=$1 AND status='ACTIVE' ORDER BY display_name", [organizationId]) : Promise.resolve({ rows: [] })
    ]);
    res.render('loans', { title: '대여·반납', loans: loans.rows, items: items.rows, users: users.rows, manager });
  });

  app.post('/loans', requireRole('MANAGER', 'ADMIN'), async (req, res) => {
    await checkoutItem(pool, req.user.id, req.body, auditTrace(req));
    setFlash(req, 'success', '대여 처리를 완료했습니다.');
    res.redirect('/loans');
  });

  app.post('/loans/:id/return', requireRole('MANAGER', 'ADMIN'), async (req, res) => {
    await returnItem(pool, req.user.id, req.params.id, req.body, auditTrace(req));
    setFlash(req, 'success', '반납 처리를 완료했습니다.');
    res.redirect('/loans');
  });

  app.get('/audit', requireRole('ADMIN'), async (req, res) => {
    const result = await pool.query(`SELECT a.*, u.display_name, u.email FROM audit_logs a
      LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.organization_id=$1 ORDER BY a.created_at DESC LIMIT 200`, [req.user.organizationId]);
    res.render('audit', { title: '감사 로그', logs: result.rows });
  });

  app.use('/api', (req, res) => apiError(req, res, 404, 'NOT_FOUND', 'API 경로를 찾을 수 없습니다.'));
  app.use((req, res) => res.status(404).render('error', { title: '페이지 없음', status: 404, message: '요청한 페이지를 찾을 수 없습니다.' }));
  app.use((error, req, res, _next) => {
    const status = error.status || 500;
    if (status >= 500) console.error(JSON.stringify({
      event: 'request_error', requestId: req.id, status, name: error.name, message: error.message
    }));
    if (req.path.startsWith('/api/')) return res.status(status).json({
      code: error.code || (status >= 500 ? 'INTERNAL_ERROR' : (error.name === 'DomainError' ? 'DOMAIN_ERROR' : 'REQUEST_ERROR')),
      message: status >= 500 ? '처리 중 오류가 발생했습니다.' : error.message,
      fieldErrors: error.fieldErrors || [],
      requestId: req.id,
      ...(error.code === 'CSRF_INVALID' ? { csrfRefreshRequired: true } : {})
    });
    if (req.accepts('html')) return res.status(status).render('error', { title: '오류', status, message: status >= 500 ? '처리 중 오류가 발생했습니다.' : error.message });
    res.status(status).json({ error: status >= 500 ? 'internal_error' : error.message });
  });

  return app;
}

module.exports = { createApp, safeReturnPath, apiError, requiresMfaEnrollment };
