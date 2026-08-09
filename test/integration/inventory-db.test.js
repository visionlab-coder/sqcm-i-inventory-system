const test = require('node:test');
const assert = require('node:assert/strict');
const { createPool } = require('../../src/db');
const { createItem, updateItem, deactivateItem, checkoutItem, returnItem } = require('../../src/services/inventory-service');

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;

test('PostgreSQL에서 등록 → 대여 → 반납 왕복이 수량 무결성을 유지한다', { skip: !databaseUrl }, async () => {
  const pool = createPool(databaseUrl);
  const marker = Date.now().toString().slice(-9);
  let itemId;
  let loanId;
  try {
    const manager = await pool.query("SELECT id, email FROM users WHERE role='MANAGER' AND status='ACTIVE' LIMIT 1");
    assert.equal(manager.rowCount, 1);
    const actor = manager.rows[0];
    const item = await createItem(pool, actor.id, { code: `TS-${marker}`, name: '통합테스트 비품', category: '테스트', totalQuantity: 5, minQuantity: 1 });
    itemId = item.id;
    const loan = await checkoutItem(pool, actor.id, { itemId, borrowerEmail: actor.email, quantity: 2, dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    loanId = loan.id;
    let quantity = await pool.query('SELECT available_quantity FROM items WHERE id=$1', [itemId]);
    assert.equal(quantity.rows[0].available_quantity, 3);
    await assert.rejects(
      updateItem(pool, actor.id, itemId, { name: '통합테스트 비품', category: '테스트', totalQuantity: 1, minQuantity: 1, location: '시험창고' }),
      error => error.name === 'DomainError' && error.status === 409
    );
    await returnItem(pool, actor.id, loanId, { condition: 'GOOD', note: '자동 테스트' });
    quantity = await pool.query('SELECT available_quantity FROM items WHERE id=$1', [itemId]);
    assert.equal(quantity.rows[0].available_quantity, 5);
    const updated = await updateItem(pool, actor.id, itemId, { name: '통합테스트 수정 비품', category: '시험장비', totalQuantity: 8, minQuantity: 2, location: '시험창고 B' });
    assert.equal(updated.name, '통합테스트 수정 비품');
    assert.equal(updated.available_quantity, 8);
    assert.equal(updated.location, '시험창고 B');
    const deactivated = await deactivateItem(pool, actor.id, itemId);
    assert.equal(deactivated.status, 'INACTIVE');
    const audit = await pool.query("SELECT count(*)::int AS count FROM audit_logs WHERE entity_id IN ($1,$2)", [String(itemId), String(loanId)]);
    assert.ok(audit.rows[0].count >= 5);
    const migrations = await pool.query("SELECT version FROM schema_migrations ORDER BY version");
    assert.deepEqual(migrations.rows.map(row => row.version), ['001_init.sql', '002_audit_trace.sql', '003_enterprise_inventory.sql', '004_procurement_inspection_assets.sql', '005_organization_invitations.sql', '006_reference_data_lifecycle.sql', '007_asset_status_reason_reference.sql', '008_asset_evidence_files.sql', '009_mfa_credentials.sql', '010_department_scope_backfill.sql', '011_multistage_approvals.sql', '012_return_evidence.sql', '013_oidc_identity.sql', '014_api_idempotency.sql', '015_outbox_delivery.sql']);
  } finally {
    if (loanId || itemId) {
      await pool.query("DELETE FROM audit_logs WHERE entity_id = ANY($1::text[])", [[String(itemId || ''), String(loanId || '')]]);
      if (loanId) await pool.query('DELETE FROM loans WHERE id=$1', [loanId]);
      if (itemId) await pool.query('DELETE FROM items WHERE id=$1', [itemId]);
    }
    await pool.end();
  }
});
