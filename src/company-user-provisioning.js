const bcrypt = require('bcryptjs');

const COMPANY_EMAIL_DOMAIN = 'seowonenc.co.kr';

function validateCompanyUserManifest(input) {
  if (!input || input.schemaVersion !== 1 || input.organizationCode !== 'SEOWON' || input.departmentCode !== 'HQ') {
    throw new Error('company user manifest identity is invalid.');
  }
  if (!Array.isArray(input.users) || input.users.length === 0 || input.users.length > 500) {
    throw new Error('company user manifest users must contain 1 to 500 entries.');
  }
  const initialPassword = String(input.initialPassword || '');
  if (initialPassword.length < 10 || initialPassword.length > 128) {
    throw new Error('initial password length is invalid.');
  }
  const seen = new Set();
  const users = input.users.map(entry => {
    const email = String(entry?.email || '').trim().toLowerCase();
    const displayName = String(entry?.displayName || '').trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.split('@')[1] !== COMPANY_EMAIL_DOMAIN) {
      throw new Error('company user email domain is invalid.');
    }
    if (!displayName || displayName.length > 100) throw new Error('company user display name is invalid.');
    if (/\uFFFD/.test(displayName)) throw new Error('company user display name encoding is invalid.');
    if (seen.has(email)) throw new Error('company user manifest contains duplicate email.');
    seen.add(email);
    return { email, displayName };
  });
  return { initialPassword, users };
}

async function provisionCompanyUsers(pool, input) {
  const manifest = validateCompanyUserManifest(input);
  const passwordHash = await bcrypt.hash(manifest.initialPassword, 12);
  const client = await pool.connect();
  let inserted = 0;
  let preserved = 0;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [9132030]);
    const target = await client.query(`SELECT o.id organization_id,d.id department_id
      FROM organizations o JOIN departments d ON d.organization_id=o.id
      WHERE o.code='SEOWON' AND o.status='ACTIVE' AND d.code='HQ' AND d.status='ACTIVE'`);
    if (target.rowCount !== 1) throw new Error('company organization or department target is not unique.');
    const { organization_id: organizationId, department_id: departmentId } = target.rows[0];
    for (const user of manifest.users) {
      const existing = await client.query('SELECT id FROM users WHERE lower(email)=lower($1)', [user.email]);
      if (existing.rowCount) { preserved += 1; continue; }
      const created = await client.query(`INSERT INTO users
        (email,display_name,password_hash,role,status,organization_id,department_id,mfa_enabled,password_reset_required)
        VALUES($1,$2,$3,'USER','ACTIVE',$4,$5,false,true) RETURNING id`,
      [user.email, user.displayName, passwordHash, organizationId, departmentId]);
      await client.query(`INSERT INTO user_role_scopes(user_id,role_code,organization_id,department_id,scope_type)
        VALUES($1,'USER',$2,$3,'DEPARTMENT')`, [created.rows[0].id, organizationId, departmentId]);
      await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,organization_id,metadata)
        VALUES(NULL,'COMPANY_USER_PROVISIONED','USER',$1,$2,$3::jsonb)`, [String(created.rows[0].id), organizationId, JSON.stringify({ source:'approved_company_roster', passwordResetRequired:true })]);
      inserted += 1;
    }
    await client.query('COMMIT');
    return { status:'PASS', requested:manifest.users.length, inserted, preserved, passwordResetRequired:inserted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { COMPANY_EMAIL_DOMAIN, validateCompanyUserManifest, provisionCompanyUsers };
