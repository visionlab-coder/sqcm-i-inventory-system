const crypto = require('node:crypto');

class PostgresFileStore {
  constructor(pool) {
    if (!pool || typeof pool.query !== 'function') throw new Error('PostgresFileStore requires a database pool.');
    this.pool = pool;
    this.driver = 'POSTGRES';
  }

  validateKey(storageKey) {
    const key = String(storageKey || '');
    if (!/^[a-zA-Z0-9/_-]+\.[a-z0-9]+$/.test(key) || key.length > 500) throw new Error('Invalid storage key');
    return key;
  }

  async write(storageKey, content) {
    const key = this.validateKey(storageKey);
    if (!Buffer.isBuffer(content) || content.length < 1 || content.length > 5 * 1024 * 1024) throw new Error('Invalid file content');
    const checksum = crypto.createHash('sha256').update(content).digest('hex');
    await this.pool.query(
      'INSERT INTO file_blobs(storage_key,content,checksum,size_bytes) VALUES($1,$2,$3,$4)',
      [key, content, checksum, content.length]
    );
    return key;
  }

  async read(storageKey) {
    const result = await this.pool.query('SELECT content FROM file_blobs WHERE storage_key=$1', [this.validateKey(storageKey)]);
    if (!result.rowCount) throw new Error('Stored file not found');
    return result.rows[0].content;
  }

  async removeNew(storageKey) {
    await this.pool.query('DELETE FROM file_blobs WHERE storage_key=$1', [this.validateKey(storageKey)]);
  }

  async healthCheck() {
    const result = await this.pool.query("SELECT to_regclass('public.file_blobs') name");
    if (!result.rows[0]?.name) throw new Error('file_blobs table is missing');
    return { status: 'ok', driver: this.driver };
  }
}

module.exports = { PostgresFileStore };
