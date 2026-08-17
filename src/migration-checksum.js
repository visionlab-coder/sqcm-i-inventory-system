const crypto = require('node:crypto');

function normalizeMigrationSql(sql) {
  return sql.replace(/\r\n?/g, '\n');
}

function hashSql(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex');
}

function migrationChecksum(sql) {
  return hashSql(normalizeMigrationSql(sql));
}

function migrationChecksumCandidates(sql) {
  const normalized = normalizeMigrationSql(sql);
  return new Set([
    hashSql(normalized),
    hashSql(normalized.replace(/\n/g, '\r\n'))
  ]);
}

module.exports = { migrationChecksum, migrationChecksumCandidates, normalizeMigrationSql };
