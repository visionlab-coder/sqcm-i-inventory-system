const path = require('node:path');
const express = require('express');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const { DUMMY_HASH, csrfToken, csrfProtection, requireAuth, requireRole, sanitizeUser } = require('./security');
const { createItem, checkoutItem, returnItem } = require('./services/inventory-service');

function safeReturnPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

async function writeAudit(pool, actorId, action, entityType = 'AUTH', entityId = null, metadata = {}) {
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorId || null, action, entityType, entityId ? String(entityId) : null, JSON.stringify(metadata)]
  );
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function createApp({ pool, config }) {
  const app = express();
  const PgSession = connectPgSimple(session);
  if (config.env === 'production') app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(process.cwd(), 'src', 'views'));
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
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
          "SELECT id, email, display_name, role, status FROM users WHERE id = $1 AND status = 'ACTIVE'",
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

  app.get('/login', (req, res) => {
    if (req.user) return res.redirect('/');
    res.render('login', { title: '로그인', reason: req.query.reason || '', returnTo: safeReturnPath(req.query.returnTo) });
  });

  app.post('/login', async (req, res) => {
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
      await writeAudit(pool, user?.id, 'LOGIN_FAILED', 'AUTH', user?.id, { reason: locked ? 'locked' : 'invalid' });
      return res.status(401).render('login', {
        title: '로그인', reason: 'invalid', returnTo: safeReturnPath(req.body.returnTo),
        flash: { type: 'error', message: '이메일 또는 비밀번호를 확인하세요.' }
      });
    }

    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.userId = user.id;
    req.session.csrfToken = require('node:crypto').randomBytes(32).toString('hex');
    await pool.query('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
    await writeAudit(pool, user.id, 'LOGIN_SUCCEEDED', 'AUTH', user.id);
    res.redirect(safeReturnPath(req.body.returnTo));
  });

  app.post('/logout', requireAuth, async (req, res, next) => {
    const userId = req.user.id;
    try {
      await writeAudit(pool, userId, 'LOGOUT', 'AUTH', userId);
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
    await createItem(pool, req.user.id, req.body);
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
    await checkoutItem(pool, req.user.id, req.body);
    setFlash(req, 'success', '대여 처리를 완료했습니다.');
    res.redirect('/loans');
  });

  app.post('/loans/:id/return', requireRole('MANAGER', 'ADMIN'), async (req, res) => {
    await returnItem(pool, req.user.id, req.params.id, req.body);
    setFlash(req, 'success', '반납 처리를 완료했습니다.');
    res.redirect('/loans');
  });

  app.get('/audit', requireRole('ADMIN'), async (_req, res) => {
    const result = await pool.query(`SELECT a.*, u.display_name, u.email FROM audit_logs a
      LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 200`);
    res.render('audit', { title: '감사 로그', logs: result.rows });
  });

  app.use((req, res) => res.status(404).render('error', { title: '페이지 없음', status: 404, message: '요청한 페이지를 찾을 수 없습니다.' }));
  app.use((error, req, res, _next) => {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    if (req.accepts('html')) return res.status(status).render('error', { title: '오류', status, message: status >= 500 ? '처리 중 오류가 발생했습니다.' : error.message });
    res.status(status).json({ error: status >= 500 ? 'internal_error' : error.message });
  });

  return app;
}

module.exports = { createApp, safeReturnPath };
