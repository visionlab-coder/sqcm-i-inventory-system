const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const DUMMY_HASH = bcrypt.hashSync('constant-time-dummy-password', 12);

function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

function csrfProtection(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const expected = Buffer.from(req.session.csrfToken || '', 'utf8');
  const received = Buffer.from(String(req.body?._csrf || req.get?.('x-csrf-token') || ''), 'utf8');
  if (expected.length === 0 || expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    const error = new Error('요청 검증에 실패했습니다. 페이지를 새로고침해 주세요.');
    error.status = 403;
    return next(error);
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login?reason=required');
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login?reason=required');
    if (!roles.includes(req.user.role)) {
      const error = new Error('이 기능을 사용할 권한이 없습니다.');
      error.status = 403;
      return next(error);
    }
    next();
  };
}

function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id, email: row.email, displayName: row.display_name, role: row.role, status: row.status,
    organizationId: row.organization_id || null, departmentId: row.department_id || null,
    employeeNo: row.employee_no || null, mfaEnabled: Boolean(row.mfa_enabled), passwordResetRequired: Boolean(row.password_reset_required)
  };
}

module.exports = { DUMMY_HASH, csrfToken, csrfProtection, requireAuth, requireRole, sanitizeUser };
