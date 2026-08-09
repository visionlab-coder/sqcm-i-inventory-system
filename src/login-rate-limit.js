function createLoginRateLimiter({ maxAttempts = 10, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const attempts = new Map();

  function keyFor(req) {
    const email = String(req.body?.email || '').trim().toLowerCase();
    return `${req.ip || 'unknown'}:${email}`;
  }

  function middleware(req, res, next) {
    const key = keyFor(req);
    const timestamp = now();
    const current = attempts.get(key);
    const entry = !current || current.resetAt <= timestamp
      ? { count: 0, resetAt: timestamp + windowMs }
      : current;

    entry.count += 1;
    attempts.set(key, entry);
    req.loginRateLimitKey = key;

    if (entry.count > maxAttempts) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000));
      res.setHeader('retry-after', String(retryAfter));
      const error = new Error('로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.');
      error.status = 429;
      error.code = 'LOGIN_RATE_LIMITED';
      return next(error);
    }
    next();
  }

  middleware.clear = req => attempts.delete(req.loginRateLimitKey || keyFor(req));
  middleware.reset = () => attempts.clear();
  return middleware;
}

module.exports = { createLoginRateLimiter };
