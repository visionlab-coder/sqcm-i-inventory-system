const bcrypt = require('bcryptjs');

const COMPANY_EMAIL_DOMAIN = 'seowonenc.co.kr';

function validateCompanyMasterManifest(input) {
  if (!input || input.schemaVersion !== 1 || input.organizationCode !== 'SEOWON' || input.departmentCode !== 'HQ') {
    throw new Error('company master manifest identity is invalid.');
  }
  if (!/^USER_APPROVAL_[A-Z0-9_-]{8,100}$/.test(String(input.approvalId || ''))) {
    throw new Error('company master approval reference is invalid.');
  }
  const initialPassword = String(input.initialPassword || '');
  if (initialPassword.length < 10 || initialPassword.length > 128) {
    throw new Error('initial password length is invalid.');
  }
  if (!Array.isArray(input.accounts) || input.accounts.length < 1 || input.accounts.length > 10) {
    throw new Error('company master accounts must contain 1 to 10 entries.');
  }
  const seen = new Set();
  const accounts = input.accounts.map(entry => {
    const email = String(entry?.email || '').trim().toLowerCase();
    const displayName = String(entry?.displayName || '').trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.split('@')[1] !== COMPANY_EMAIL_DOMAIN) {
      throw new Error('company master email domain is invalid.');
    }
    if (!displayName || displayName.length > 100) throw new Error('company master display name is invalid.');
    if (/\uFFFD/.test(displayName)) throw new Error('company master display name encoding is invalid.');
    if (seen.has(email)) throw new Error('company master manifest contains duplicate email.');
    seen.add(email);
    return { email, displayName };
  });
  return { approvalId: input.approvalId, initialPassword, accounts };
}

async function provisionCompanyMasters(pool, input) {
  const manifest = validateCompanyMasterManifest(input);
  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [9132031]);
    const target = await client.query(`SELECT o.id organization_id,d.id department_id
      FROM organizations o JOIN departments d ON d.organization_id=o.id
      WHERE o.code='SEOWON' AND o.status='ACTIVE' AND d.code='HQ' AND d.status='ACTIVE'`);
    if (target.rowCount !== 1) throw new Error('company master organization or department target is not unique.');
    const { organization_id: organizationId, department_id: departmentId } = target.rows[0];

    for (const account of manifest.accounts) {
      const passwordHash = await bcrypt.hash(manifest.initialPassword, 12);
      const existing = await client.query('SELECT id FROM users WHERE lower(email)=lower($1) FOR UPDATE', [account.email]);
      let userId;
      if (existing.rowCount) {
        userId = existing.rows[0].id;
        await client.query(`UPDATE users SET display_name=$1,password_hash=$2,role='ADMIN',status='ACTIVE',
          organization_id=$3,department_id=$4,mfa_enabled=false,password_reset_required=true,is_system_admin=true,
          failed_login_count=0,locked_until=NULL,updated_at=now() WHERE id=$5`,
        [account.displayName, passwordHash, organizationId, departmentId, userId]);
        updated += 1;
      } else {
        const created = await client.query(`INSERT INTO users
          (email,display_name,password_hash,role,status,organization_id,department_id,mfa_enabled,password_reset_required,is_system_admin)
          VALUES($1,$2,$3,'ADMIN','ACTIVE',$4,$5,false,true,true) RETURNING id`,
        [account.email, account.displayName, passwordHash, organizationId, departmentId]);
        userId = created.rows[0].id;
        inserted += 1;
      }
      await client.query('DELETE FROM user_role_scopes WHERE user_id=$1', [userId]);
      await client.query(`INSERT INTO user_role_scopes(user_id,role_code,organization_id,department_id,scope_type)
        VALUES($1,'ADMIN',$2,NULL,'ALL')`, [userId, organizationId]);
      await client.query("DELETE FROM user_sessions WHERE (sess->>'userId')::bigint=$1 OR (sess->>'pendingMfaUserId')::bigint=$1", [userId]);
      await client.query('DELETE FROM user_mfa_credentials WHERE user_id=$1', [userId]);
      await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,organization_id,metadata)
        VALUES(NULL,'MASTER_ACCOUNT_PROVISIONED','USER',$1,$2,$3::jsonb)`, [String(userId), organizationId,
        JSON.stringify({ approvalId:manifest.approvalId, role:'ADMIN', scopeType:'ALL', isSystemAdmin:true,
          passwordResetRequired:true, mfaEnrollmentRequired:true })]);
    }

    const verified = await client.query(`SELECT count(*)::int total FROM users
      WHERE lower(email)=ANY($1::text[]) AND role='ADMIN' AND status='ACTIVE' AND password_reset_required=true
      AND mfa_enabled=false AND is_system_admin=true`, [manifest.accounts.map(account => account.email)]);
    if (verified.rows[0].total !== manifest.accounts.length) throw new Error('company master verification failed.');
    await client.query('COMMIT');
    return { status:'PASS', requested:manifest.accounts.length, inserted, updated,
      adminAllScope:manifest.accounts.length, passwordResetRequired:manifest.accounts.length,
      mfaEnrollmentRequired:manifest.accounts.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { COMPANY_EMAIL_DOMAIN, validateCompanyMasterManifest, provisionCompanyMasters };
