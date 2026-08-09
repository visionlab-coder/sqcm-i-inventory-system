const crypto = require('node:crypto');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function canonicalize(value) {
  if (Buffer.isBuffer(value)) return { bufferSha256: crypto.createHash('sha256').update(value).digest('hex'), bytes: value.length };
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  return value;
}

function requestHash(req) {
  const input = {
    method: req.method,
    path: req.originalUrl || req.url,
    contentType: String(req.get?.('content-type') || '').split(';')[0].toLowerCase(),
    fileName: String(req.get?.('x-file-name') || ''),
    fileType: String(req.get?.('x-file-type') || ''),
    contentLength: String(req.get?.('content-length') || ''),
    body: canonicalize(req.body || null)
  };
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function validIdempotencyKey(value) {
  return /^[A-Za-z0-9._:-]{8,100}$/.test(String(value || ''));
}

function idempotencyError(code, message, status) {
  const error = new Error(message); error.code = code; error.status = status; return error;
}

function createIdempotencyMiddleware({ pool, required = false }) {
  return async (req, res, next) => {
    if (!MUTATING_METHODS.has(req.method)) return next();
    const key = String(req.get('idempotency-key') || '').trim();
    if (!key) return required ? next(idempotencyError('IDEMPOTENCY_KEY_REQUIRED', '중복 요청 방지 키가 필요합니다.', 400)) : next();
    if (!validIdempotencyKey(key)) return next(idempotencyError('IDEMPOTENCY_KEY_INVALID', '중복 요청 방지 키 형식이 올바르지 않습니다.', 400));

    try {
      const hash = requestHash(req);
      const inserted = await pool.query(`INSERT INTO api_idempotency_keys(user_id,idempotency_key,request_hash)
        VALUES($1,$2,$3) ON CONFLICT(user_id,idempotency_key) DO NOTHING RETURNING id`, [req.user.id, key, hash]);
      if (!inserted.rowCount) {
        const existing = await pool.query(`SELECT request_hash,status,response_status,response_content_type,response_body_base64
          FROM api_idempotency_keys WHERE user_id=$1 AND idempotency_key=$2`, [req.user.id, key]);
        const row = existing.rows[0];
        if (!row || row.request_hash !== hash) return next(idempotencyError('IDEMPOTENCY_CONFLICT', '같은 중복 요청 방지 키를 다른 요청에 사용할 수 없습니다.', 409));
        if (row.status === 'COMPLETED') {
          res.setHeader('idempotent-replay', 'true'); res.status(row.response_status || 200);
          if (row.response_content_type) res.setHeader('content-type', row.response_content_type);
          return row.response_body_base64 ? res.end(Buffer.from(row.response_body_base64, 'base64')) : res.end();
        }
        const reclaimed = await pool.query(`UPDATE api_idempotency_keys SET updated_at=now()
          WHERE user_id=$1 AND idempotency_key=$2 AND status='PROCESSING' AND updated_at < now() - interval '2 minutes' RETURNING id`, [req.user.id, key]);
        if (!reclaimed.rowCount) return next(idempotencyError('IDEMPOTENCY_IN_PROGRESS', '같은 요청이 처리 중입니다. 잠시 후 결과를 확인하세요.', 409));
      }

      const originalEnd = res.end.bind(res); let finalizing = false;
      res.end = function idempotentEnd(chunk, encoding, callback) {
        if (finalizing) return originalEnd(chunk, encoding, callback);
        finalizing = true;
        const body = chunk == null ? null : Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8');
        const status = res.statusCode;
        const operation = status >= 500
          ? pool.query('DELETE FROM api_idempotency_keys WHERE user_id=$1 AND idempotency_key=$2', [req.user.id, key])
          : pool.query(`UPDATE api_idempotency_keys SET status='COMPLETED',response_status=$3,response_content_type=$4,response_body_base64=$5,updated_at=now()
              WHERE user_id=$1 AND idempotency_key=$2`, [req.user.id, key, status, String(res.getHeader('content-type') || ''), body?.toString('base64') || null]);
        operation.then(() => originalEnd(chunk, encoding, callback)).catch(error => {
          pool.query('DELETE FROM api_idempotency_keys WHERE user_id=$1 AND idempotency_key=$2', [req.user.id, key]).finally(() => next(error));
        });
        return res;
      };
      next();
    } catch (error) { next(error); }
  };
}

module.exports = { canonicalize, createIdempotencyMiddleware, requestHash, validIdempotencyKey };
