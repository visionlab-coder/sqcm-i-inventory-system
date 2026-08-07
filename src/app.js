const path = require('node:path');
const express = require('express');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { DUMMY_HASH, csrfToken, csrfProtection, requireAuth, requireRole, sanitizeUser } = require('./security');
const { createItem, updateItem, deactivateItem, checkoutItem, returnItem } = require('./services/inventory-service');
const { requestContext, requestLogger, auditTrace } = require('./observability');
const { createLoginRateLimiter } = require('./login-rate-limit');
const { createEnterpriseRouter } = require('./enterprise-routes');
const { getAuditLogs } = require('./services/reporting-service');

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

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function apiError(req, res, status, code, message, fieldErrors = []) {
  return res.status(status).json({ code, message, fieldErrors, requestId: req.id });
}

function createApp({ pool, config }) {
  const app = express();
  const PgSession = connectPgSimple(session);
  const loginRateLimit = createLoginRateLimiter({
    maxAttempts: config.loginRateLimitMax,
    windowMs: config.loginRateLimitWindowMs
  });
  if (config.env === 'production') app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(process.cwd(), 'src', 'views'));
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(requestLogger());
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '50kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(express.static(path.join(process.cwd(), 'src', 'public'), { maxAge: config.env === 'production' ? '1d' : 0 }));
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
        const result = await pool.query(
          "SELECT id,email,display_name,role,status,organization_id,department_id,employee_no,mfa_enabled,password_reset_required FROM users WHERE id = $1 AND status = 'ACTIVE'",
          [req.session.userId]
        );
        req.user = sanitizeUser(result.rows[0]);
        if (!req.user) delete req.session.userId;
      }
      const flash = req.session.flash;
      delete req.session.flash;
      res.locals.currentUser = req.user;
      res.locals.csrfToken = csrfToken(req);
      res.locals.flash = flash;
      res.locals.path = req.path;
      next();
    } catch (error) {
      next(error);
    }
  });
  app.use(csrfProtection);

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'up' });
    } catch (_error) {
      res.status(503).json({ status: 'error', database: 'down' });
    }
  });

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
    next();
  };

  app.use('/api/enterprise', createEnterpriseRouter({ pool, apiAuth, requireRecentReauth }));

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', service: 'backend', database: 'up' });
    } catch (_error) {
      res.status(503).json({ status: 'error', service: 'backend', database: 'down' });
    }
  });

  app.get('/api/auth/csrf', (req, res) => res.json({ csrfToken: csrfToken(req) }));
  app.get('/api/auth/me', apiAuth, (req, res) => res.json({ user: req.user, csrfToken: csrfToken(req) }));

  app.post('/api/auth/login', loginRateLimit, async (req, res) => {
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

    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.userId = user.id;
    req.session.csrfToken = require('node:crypto').randomBytes(32).toString('hex');
    loginRateLimit.clear(req);
    await pool.query('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
    await writeAudit(pool, user.id, 'LOGIN_SUCCEEDED', 'AUTH', user.id, {}, auditTrace(req));
    res.json({ user: sanitizeUser(user), csrfToken: req.session.csrfToken });
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

  app.get('/api/dashboard', apiAuth, async (_req, res) => {
    const [counts, items, loans] = await Promise.all([
      pool.query(`SELECT
        (SELECT count(*) FROM items WHERE status = 'ACTIVE')::int AS total_items,
        (SELECT COALESCE(sum(quantity), 0) FROM loans WHERE returned_at IS NULL)::int AS loaned,
        (SELECT count(*) FROM loans WHERE returned_at IS NULL AND due_at < now())::int AS overdue,
        (SELECT count(*) FROM items WHERE status = 'ACTIVE' AND available_quantity <= min_quantity)::int AS low_stock`),
      pool.query("SELECT * FROM items WHERE status = 'ACTIVE' ORDER BY (available_quantity <= min_quantity) DESC, updated_at DESC LIMIT 8"),
      pool.query(`SELECT l.*, i.code, i.name AS item_name, u.display_name AS borrower_name
                  FROM loans l JOIN items i ON i.id=l.item_id JOIN users u ON u.id=l.user_id
                  WHERE l.returned_at IS NULL ORDER BY l.due_at ASC LIMIT 8`)
    ]);
    res.json({ stats: counts.rows[0], items: items.rows, loans: loans.rows });
  });

  app.get('/api/items', apiAuth, async (req, res) => {
    const query = String(req.query.q || '').trim();
    const status = String(req.query.status || 'ALL');
    const values = [];
    const where = ["status = 'ACTIVE'"];
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
    const itemResult = await pool.query('SELECT * FROM items WHERE id=$1', [req.params.id]);
    if (!itemResult.rowCount) return apiError(req, res, 404, 'NOT_FOUND', '비품을 찾을 수 없습니다.');
    const loanResult = await pool.query(
      `SELECT l.id, l.quantity, l.loaned_at, l.due_at, l.returned_at, l.return_condition,
              u.display_name AS borrower_name
       FROM loans l JOIN users u ON u.id=l.user_id
       WHERE l.item_id=$1 ORDER BY l.loaned_at DESC LIMIT 20`,
      [req.params.id]
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
    const params = manager ? [] : [req.user.id];
    const scope = manager ? '' : 'WHERE l.user_id = $1';
    const [loans, items, users] = await Promise.all([
      pool.query(`SELECT l.*, i.code, i.name AS item_name, u.email, u.display_name AS borrower_name,
                         (l.returned_at IS NULL AND l.due_at < now()) AS overdue
                  FROM loans l JOIN items i ON i.id=l.item_id JOIN users u ON u.id=l.user_id
                  ${scope} ORDER BY (l.returned_at IS NULL) DESC, l.due_at DESC LIMIT 100`, params),
      pool.query("SELECT id, code, name, available_quantity FROM items WHERE status='ACTIVE' AND available_quantity > 0 ORDER BY name"),
      manager ? pool.query("SELECT email, display_name FROM users WHERE status='ACTIVE' ORDER BY display_name") : Promise.resolve({ rows: [] })
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
    res.json(await getAuditLogs(pool, req.query));
  });

  app.get('/login', (req, res) => {
    if (req.user) return res.redirect('/');
    res.render('login', { title: '로그인', reason: req.query.reason || '', returnTo: safeReturnPath(req.query.returnTo) });
  });

  app.post('/login', loginRateLimit, async (req, res) => {
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
    const [counts, items, loans] = await Promise.all([
      pool.query(`SELECT
        (SELECT count(*) FROM items WHERE status = 'ACTIVE')::int AS total_items,
        (SELECT COALESCE(sum(quantity), 0) FROM loans WHERE returned_at IS NULL)::int AS loaned,
        (SELECT count(*) FROM loans WHERE returned_at IS NULL AND due_at < now())::int AS overdue,
        (SELECT count(*) FROM items WHERE status = 'ACTIVE' AND available_quantity <= min_quantity)::int AS low_stock`),
      pool.query("SELECT * FROM items WHERE status = 'ACTIVE' ORDER BY (available_quantity <= min_quantity) DESC, updated_at DESC LIMIT 8"),
      pool.query(`SELECT l.*, i.code, i.name AS item_name, u.display_name AS borrower_name
                  FROM loans l JOIN items i ON i.id=l.item_id JOIN users u ON u.id=l.user_id
                  WHERE l.returned_at IS NULL ORDER BY l.due_at ASC LIMIT 8`)
    ]);
    res.render('dashboard', { title: '대시보드', stats: counts.rows[0], items: items.rows, loans: loans.rows });
  });

  app.get('/items', requireAuth, async (req, res) => {
    const query = String(req.query.q || '').trim();
    const status = String(req.query.status || 'ALL');
    const values = [];
    const where = ["status = 'ACTIVE'"];
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
    const params = manager ? [] : [req.user.id];
    const scope = manager ? '' : 'WHERE l.user_id = $1';
    const [loans, items, users] = await Promise.all([
      pool.query(`SELECT l.*, i.code, i.name AS item_name, u.email, u.display_name AS borrower_name,
                         (l.returned_at IS NULL AND l.due_at < now()) AS overdue
                  FROM loans l JOIN items i ON i.id=l.item_id JOIN users u ON u.id=l.user_id
                  ${scope} ORDER BY (l.returned_at IS NULL) DESC, l.due_at DESC LIMIT 100`, params),
      pool.query("SELECT id, code, name, available_quantity FROM items WHERE status='ACTIVE' AND available_quantity > 0 ORDER BY name"),
      manager ? pool.query("SELECT email, display_name FROM users WHERE status='ACTIVE' ORDER BY display_name") : Promise.resolve({ rows: [] })
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

  app.get('/audit', requireRole('ADMIN'), async (_req, res) => {
    const result = await pool.query(`SELECT a.*, u.display_name, u.email FROM audit_logs a
      LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 200`);
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
      requestId: req.id
    });
    if (req.accepts('html')) return res.status(status).render('error', { title: '오류', status, message: status >= 500 ? '처리 중 오류가 발생했습니다.' : error.message });
    res.status(status).json({ error: status >= 500 ? 'internal_error' : error.message });
  });

  return app;
}

module.exports = { createApp, safeReturnPath, apiError };
