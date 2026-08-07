import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const baseUrl = (process.env.MAINTENANCE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const connectionString = process.env.MAINTENANCE_DATABASE_URL;

if (!connectionString) {
  console.error("MAINTENANCE_DATABASE_URL이 필요합니다.");
  process.exit(1);
}

async function health(path, expectedService) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`${path} health failed: ${response.status}`);
  const body = await response.json();
  if (body.status !== "ok" || body.service !== expectedService) {
    throw new Error(`${path} health contract mismatch`);
  }
  return response.status;
}

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });

try {
  const [frontendStatus, backendStatus] = await Promise.all([
    health("/health", "frontend"),
    health("/api/health", "backend")
  ]);

  const { rows: [summary] } = await pool.query(`
    SELECT
      current_database() AS database_name,
      current_setting('server_version') AS postgres_version,
      pg_database_size(current_database())::bigint AS database_bytes,
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM items) AS items,
      (SELECT count(*)::int FROM loans) AS loans,
      (SELECT count(*)::int FROM audit_logs) AS audit_logs,
      (SELECT count(*)::int FROM assets) AS assets,
      (SELECT count(*)::int FROM workflow_requests) AS workflow_requests,
      (SELECT count(*)::int FROM service_tickets) AS service_tickets,
      (SELECT count(*)::int FROM stocktakes) AS stocktakes,
      (SELECT count(*)::int FROM outbox_events WHERE published_at IS NULL) AS pending_outbox,
      (SELECT count(*)::int FROM loans WHERE returned_at IS NULL AND due_at < now()) AS overdue_loans,
      (SELECT count(*)::int FROM items WHERE status = 'ACTIVE' AND available_quantity <= min_quantity) AS low_stock_items,
      (SELECT count(*)::int FROM user_sessions WHERE expire < now()) AS expired_sessions,
      (SELECT max(created_at) FROM audit_logs) AS latest_audit_at
  `);

  const { rows: tableRows } = await pool.query(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
     ORDER BY table_name
  `, [["asset_assignments","asset_files","asset_status_histories","assets","audit_logs","departments","disposal_requests","file_records","inspection_assets","inspections","item_categories","item_models","items","loans","locations","organizations","outbox_events","password_reset_tokens","purchase_orders","receipts","schema_migrations","service_tickets","stocktake_items","stocktakes","user_invitations","user_role_scopes","user_sessions","users","vendors","workflow_requests"]]);

  if (tableRows.length !== 30) throw new Error(`required table count mismatch: ${tableRows.length}/30`);

  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    health: { frontend: frontendStatus, backend: backendStatus },
    database: summary,
    requiredTables: tableRows.map(row => row.table_name)
  }, null, 2));
  console.log("유지보수 상태 점검 통과");
} finally {
  await pool.end();
}
