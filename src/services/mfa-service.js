const crypto = require('node:crypto');
const { DomainError } = require('./inventory-service');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encodeBase32(buffer) {
  let bits = 0; let value = 0; let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(input) {
  const normalized = String(input || '').toUpperCase().replace(/=|\s|-/g, '');
  let bits = 0; let value = 0; const bytes = [];
  for (const char of normalized) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new DomainError('MFA 비밀 형식이 올바르지 않습니다.', 500);
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

function normalizeKey(value) {
  if (Buffer.isBuffer(value) && value.length === 32) return value;
  const decoded = Buffer.from(String(value || ''), 'base64');
  if (decoded.length !== 32) throw new Error('MFA 암호화 키는 base64 32-byte 값이어야 합니다.');
  return decoded;
}

function encryptSecret(secret, keyInput) {
  const key = normalizeKey(keyInput); const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(payload, keyInput) {
  const [version, ivText, tagText, dataText] = String(payload || '').split(':');
  if (version !== 'v1' || !ivText || !tagText || !dataText) throw new Error('저장된 MFA 비밀 형식이 올바르지 않습니다.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', normalizeKey(keyInput), Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64')), decipher.final()]).toString('utf8');
}

function hotp(secret, counter) {
  const counterBuffer = Buffer.alloc(8); counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | ((digest[offset + 1] & 255) << 16) | ((digest[offset + 2] & 255) << 8) | (digest[offset + 3] & 255);
  return String(binary % 1_000_000).padStart(6, '0');
}

function totp(secret, now = Date.now()) { return hotp(secret, Math.floor(now / 30_000)); }

function verifyTotp(secret, code, { now = Date.now(), window = 1, lastUsedCounter = null } = {}) {
  const normalized = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const current = Math.floor(now / 30_000);
  for (let offset = -window; offset <= window; offset += 1) {
    const counter = current + offset;
    if (lastUsedCounter != null && counter <= Number(lastUsedCounter)) continue;
    const expected = Buffer.from(hotp(secret, counter)); const received = Buffer.from(normalized);
    if (expected.length === received.length && crypto.timingSafeEqual(expected, received)) return counter;
  }
  return null;
}

function hashRecoveryCode(code) { return crypto.createHash('sha256').update(String(code || '').replace(/\s|-/g, '').toUpperCase()).digest('hex'); }
function recoveryCodes() { return Array.from({ length: 8 }, () => crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{1,4}/g).join('-')); }

async function audit(client, actorId, action, metadata, trace = {}) {
  await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
    VALUES($1,$2,'AUTH',$3,$4::jsonb,$5,$6)`, [actorId, action, String(actorId), JSON.stringify(metadata || {}), trace.requestId || null, trace.ip || null]);
}

async function startMfaSetup(pool, user, encryptionKey, trace = {}) {
  const secret = encodeBase32(crypto.randomBytes(20)); const encrypted = encryptSecret(secret, encryptionKey); const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO user_mfa_credentials(user_id,encrypted_secret,recovery_code_hashes,enabled_at,last_used_counter,updated_at)
      VALUES($1,$2,'[]'::jsonb,NULL,NULL,now()) ON CONFLICT(user_id) DO UPDATE SET encrypted_secret=excluded.encrypted_secret,
      recovery_code_hashes='[]'::jsonb,enabled_at=NULL,last_used_counter=NULL,updated_at=now()`, [user.id, encrypted]);
    await client.query('UPDATE users SET mfa_enabled=false,updated_at=now() WHERE id=$1', [user.id]);
    await audit(client, user.id, 'MFA_SETUP_STARTED', {}, trace); await client.query('COMMIT');
    const label = encodeURIComponent(`서원토건:${user.email}`);
    return { secret, otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('서원토건')}&digits=6&period=30` };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function enableMfa(pool, user, code, encryptionKey, trace = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM user_mfa_credentials WHERE user_id=$1 FOR UPDATE', [user.id]);
    if (!found.rowCount) throw new DomainError('먼저 MFA 등록을 시작하세요.', 409);
    const secret = decryptSecret(found.rows[0].encrypted_secret, encryptionKey); const counter = verifyTotp(secret, code);
    if (counter == null) throw new DomainError('인증 코드가 올바르지 않습니다.', 401);
    const codes = recoveryCodes();
    await client.query(`UPDATE user_mfa_credentials SET recovery_code_hashes=$1::jsonb,last_used_counter=NULL,enabled_at=now(),updated_at=now() WHERE user_id=$2`, [JSON.stringify(codes.map(hashRecoveryCode)), user.id]);
    await client.query('UPDATE users SET mfa_enabled=true,updated_at=now() WHERE id=$1', [user.id]);
    await audit(client, user.id, 'MFA_ENABLED', { recoveryCodeCount: codes.length }, trace); await client.query('COMMIT');
    return { recoveryCodes: codes };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function verifyMfaLogin(pool, userId, code, encryptionKey, trace = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT u.*,m.encrypted_secret,m.recovery_code_hashes,m.last_used_counter
      FROM users u JOIN user_mfa_credentials m ON m.user_id=u.id WHERE u.id=$1 AND u.status='ACTIVE' AND u.mfa_enabled FOR UPDATE OF u,m`, [userId]);
    if (!found.rowCount) throw new DomainError('MFA 설정을 확인할 수 없습니다.', 401);
    const row = found.rows[0]; const secret = decryptSecret(row.encrypted_secret, encryptionKey);
    const counter = verifyTotp(secret, code, { lastUsedCounter: row.last_used_counter });
    const recoveryHash = hashRecoveryCode(code); const hashes = Array.isArray(row.recovery_code_hashes) ? row.recovery_code_hashes : [];
    const recoveryIndex = hashes.findIndex(value => value === recoveryHash);
    if (counter == null && recoveryIndex < 0) {
      await audit(client, row.id, 'MFA_VERIFICATION_FAILED', {}, trace); await client.query('COMMIT'); return null;
    }
    if (counter != null) await client.query('UPDATE user_mfa_credentials SET last_used_counter=$1,updated_at=now() WHERE user_id=$2', [counter, row.id]);
    else { hashes.splice(recoveryIndex, 1); await client.query('UPDATE user_mfa_credentials SET recovery_code_hashes=$1::jsonb,updated_at=now() WHERE user_id=$2', [JSON.stringify(hashes), row.id]); }
    await audit(client, row.id, 'MFA_VERIFICATION_SUCCEEDED', { method: counter != null ? 'TOTP' : 'RECOVERY_CODE' }, trace);
    await client.query('COMMIT'); return row;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function disableMfa(pool, user, code, encryptionKey, trace = {}) {
  const verified = await verifyMfaLogin(pool, user.id, code, encryptionKey, trace);
  if (!verified) throw new DomainError('인증 코드가 올바르지 않습니다.', 401);
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await client.query('DELETE FROM user_mfa_credentials WHERE user_id=$1', [user.id]);
    await client.query('UPDATE users SET mfa_enabled=false,updated_at=now() WHERE id=$1', [user.id]);
    await audit(client, user.id, 'MFA_DISABLED', {}, trace); await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

module.exports = { encodeBase32, decodeBase32, encryptSecret, decryptSecret, hotp, totp, verifyTotp, hashRecoveryCode, startMfaSetup, enableMfa, verifyMfaLogin, disableMfa };
