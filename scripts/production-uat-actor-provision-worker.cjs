const { Client } = require('/app/node_modules/pg');
const bcrypt = require('/app/node_modules/bcryptjs');
const { encryptSecret } = require('/app/src/services/mfa-service');

async function readInput() { const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString('utf8')); }

(async()=>{
  const input=await readInput();
  if(input.environment!=='production'||input.organizationCode!=='SEOWON'||!Array.isArray(input.actors)||input.actors.length!==3)throw new Error('Worker input contract invalid.');
  const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
  try{
    await client.query('BEGIN');
    const organization=await client.query("SELECT id FROM organizations WHERE code='SEOWON' AND status='ACTIVE' FOR SHARE");
    const department=await client.query("SELECT id FROM departments WHERE organization_id=$1 AND code='HQ' AND status='ACTIVE' FOR SHARE",[organization.rows[0]?.id]);
    if(organization.rowCount!==1||department.rowCount!==1)throw new Error('Exact Production organization and department are required.');
    const organizationId=organization.rows[0].id;const departmentId=department.rows[0].id;const roles=[];let createdCount=0;let updatedCount=0;
    for(const actor of input.actors){
      const role=String(actor.role).toUpperCase();const email=String(actor.email).toLowerCase();const marker=`P6-UAT-${role}`;const scopeType=role==='USER'?'DEPARTMENT':'ORGANIZATION';
      const existing=await client.query('SELECT id,employee_no,role,organization_id FROM users WHERE lower(email)=lower($1) FOR UPDATE',[email]);
      let userId;
      const passwordHash=await bcrypt.hash(actor.password,12);const encryptedSecret=encryptSecret(actor.totpSecret,process.env.MFA_ENCRYPTION_KEY);
      if(existing.rowCount){
        const row=existing.rows[0];if(row.employee_no!==marker||row.role!==role||Number(row.organization_id)!==Number(organizationId))throw new Error(`Identity conflict for ${role}.`);
        userId=row.id;await client.query(`UPDATE users SET display_name=$1,password_hash=$2,status='ACTIVE',department_id=$3,mfa_enabled=true,password_reset_required=false,failed_login_count=0,locked_until=NULL,is_system_admin=false,updated_at=now() WHERE id=$4`,[`Production UAT ${role}`,passwordHash,departmentId,userId]);updatedCount+=1;
      }else{
        const inserted=await client.query(`INSERT INTO users(email,display_name,password_hash,role,status,organization_id,department_id,employee_no,mfa_enabled,password_reset_required,is_system_admin) VALUES($1,$2,$3,$4,'ACTIVE',$5,$6,$7,true,false,false) RETURNING id`,[email,`Production UAT ${role}`,passwordHash,role,organizationId,departmentId,marker]);userId=inserted.rows[0].id;createdCount+=1;
      }
      await client.query(`INSERT INTO user_mfa_credentials(user_id,encrypted_secret,recovery_code_hashes,last_used_counter,enabled_at,updated_at) VALUES($1,$2,'[]'::jsonb,NULL,now(),now()) ON CONFLICT(user_id) DO UPDATE SET encrypted_secret=excluded.encrypted_secret,recovery_code_hashes='[]'::jsonb,last_used_counter=NULL,enabled_at=now(),updated_at=now()`,[userId,encryptedSecret]);
      await client.query('DELETE FROM user_role_scopes WHERE user_id=$1',[userId]);
      await client.query('INSERT INTO user_role_scopes(user_id,role_code,organization_id,department_id,scope_type) VALUES($1,$2,$3,$4,$5)',[userId,role,organizationId,scopeType==='DEPARTMENT'?departmentId:null,scopeType]);
      await client.query("DELETE FROM user_sessions WHERE sess->>'userId'=$1",[String(userId)]);
      await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,organization_id)
        SELECT NULL,'PRODUCTION_UAT_ACTOR_PROVISIONED','USER',$1,$2::jsonb,$3,$4
        WHERE NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=$3)`,[String(userId),JSON.stringify({role,scopeType,approvalId:input.approvalId}),`p6-uat-provision-${input.approvalId}-${role}`,organizationId]);
      roles.push(role);
    }
    const markers=['P6-UAT-ADMIN','P6-UAT-MANAGER','P6-UAT-USER'];
    const post=await client.query(`SELECT count(*) filter(where status='ACTIVE') active_count,count(*) filter(where mfa_enabled) mfa_count FROM users WHERE employee_no=ANY($1::text[])`,[markers]);
    const scopes=await client.query('SELECT count(*) FROM user_role_scopes s JOIN users u ON u.id=s.user_id WHERE u.employee_no=ANY($1::text[])',[markers]);
    const audits=await client.query("SELECT count(*) FROM audit_logs WHERE request_id LIKE $1",[`p6-uat-provision-${input.approvalId}-%`]);
    const sessions=await client.query("SELECT count(*) FROM user_sessions s JOIN users u ON s.sess->>'userId'=u.id::text WHERE u.employee_no=ANY($1::text[])",[markers]);
    await client.query('COMMIT');
    console.log(JSON.stringify({roles:roles.sort(),createdCount,updatedCount,activeCount:Number(post.rows[0].active_count),mfaEnabledCount:Number(post.rows[0].mfa_count),scopeCount:Number(scopes.rows[0].count),auditCount:Number(audits.rows[0].count),sessionCountAfter:Number(sessions.rows[0].count),secretValuesReadOrRecorded:false}));
  }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
})().catch((error)=>{console.error(JSON.stringify({status:'FAIL_UAT_ACTOR_WORKER',failure:String(error.message||'worker failure').replace(/[\r\n]/g,' ').slice(0,200),secretValuesReadOrRecorded:false}));process.exit(1);});
