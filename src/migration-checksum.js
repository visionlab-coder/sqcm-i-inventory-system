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
  const body = normalized.replace(/[\t \r\n]+$/, '');
  const newlineVariants = [body, `${body}\n`, `${body}\n\n`, normalized];
  return new Set(newlineVariants.flatMap(value => [hashSql(value), hashSql(value.replace(/\n/g, '\r\n'))]));
}

module.exports = { migrationChecksum, migrationChecksumCandidates, normalizeMigrationSql };
