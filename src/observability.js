const crypto = require('node:crypto');

function requestContext(req, res, next) {
  const incoming = String(req.get('x-request-id') || '');
  req.id = /^[A-Za-z0-9._-]{8,100}$/.test(incoming) ? incoming : crypto.randomUUID();
  req.startedAt = process.hrtime.bigint();
  res.setHeader('x-request-id', req.id);
  next();
}

function requestLogger(logger = console) {
  return (req, res, next) => {
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - req.startedAt) / 1e6;
      logger.log(JSON.stringify({
        event: 'http_request',
        requestId: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(1)),
        userId: req.user?.id || null
      }));
    });
    next();
  };
}

function auditTrace(req) {
  return { requestId: req.id || null, ip: req.ip || null };
}

module.exports = { requestContext, requestLogger, auditTrace };
