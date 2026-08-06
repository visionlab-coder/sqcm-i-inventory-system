class DomainError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
  }
}

function positiveInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new DomainError(`${field}은(는) 1 이상의 정수여야 합니다.`);
  return parsed;
}

function nonNegativeInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new DomainError(`${field}은(는) 0 이상의 정수여야 합니다.`);
  return parsed;
}

async function audit(client, actorId, action, entityType, entityId, metadata = {}) {
  await client.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorId || null, action, entityType, entityId ? String(entityId) : null, JSON.stringify(metadata)]
  );
}

async function createItem(pool, actorId, input) {
  const code = String(input.code || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  const category = String(input.category || '').trim();
  const total = nonNegativeInteger(input.totalQuantity, '총수량');
  const minimum = nonNegativeInteger(input.minQuantity, '최소재고');
  if (!/^[A-Z0-9-]{3,30}$/.test(code)) throw new DomainError('비품 코드는 영문 대문자, 숫자, 하이픈 3~30자로 입력하세요.');
  if (name.length < 2 || name.length > 100) throw new DomainError('비품명은 2~100자로 입력하세요.');
  if (category.length < 2 || category.length > 50) throw new DomainError('카테고리는 2~50자로 입력하세요.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO items (code, name, category, total_quantity, available_quantity, min_quantity)
       VALUES ($1, $2, $3, $4, $4, $5) RETURNING *`,
      [code, name, category, total, minimum]
    );
    await audit(client, actorId, 'ITEM_CREATED', 'ITEM', result.rows[0].id, { code, name, total });
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new DomainError('이미 사용 중인 비품 코드입니다.', 409);
    throw error;
  } finally {
    client.release();
  }
}

async function checkoutItem(pool, actorId, input) {
  const itemId = positiveInteger(input.itemId, '비품');
  const quantity = positiveInteger(input.quantity, '대여수량');
  const borrowerEmail = String(input.borrowerEmail || '').trim().toLowerCase();
  const dueAt = new Date(input.dueAt);
  if (!/^\S+@\S+\.\S+$/.test(borrowerEmail)) throw new DomainError('올바른 사용자 이메일을 입력하세요.');
  if (Number.isNaN(dueAt.getTime()) || dueAt <= new Date()) throw new DomainError('반납 예정일은 현재 이후여야 합니다.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query("SELECT id FROM users WHERE lower(email) = $1 AND status = 'ACTIVE'", [borrowerEmail]);
    if (!userResult.rowCount) throw new DomainError('활성 사용자를 찾을 수 없습니다.', 404);
    const itemResult = await client.query("SELECT * FROM items WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE", [itemId]);
    if (!itemResult.rowCount) throw new DomainError('사용 가능한 비품을 찾을 수 없습니다.', 404);
    const item = itemResult.rows[0];
    if (item.available_quantity < quantity) throw new DomainError(`가용 재고는 ${item.available_quantity}개입니다.`, 409);

    const loanResult = await client.query(
      `INSERT INTO loans (user_id, item_id, quantity, due_at, processed_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userResult.rows[0].id, itemId, quantity, dueAt, actorId]
    );
    await client.query('UPDATE items SET available_quantity = available_quantity - $1, updated_at = now() WHERE id = $2', [quantity, itemId]);
    await audit(client, actorId, 'ITEM_CHECKED_OUT', 'LOAN', loanResult.rows[0].id, { itemId, quantity, borrowerEmail });
    await client.query('COMMIT');
    return loanResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function returnItem(pool, actorId, loanId, input = {}) {
  const id = positiveInteger(loanId, '대여번호');
  const condition = String(input.condition || 'GOOD').toUpperCase();
  if (!['GOOD', 'DAMAGED', 'LOST'].includes(condition)) throw new DomainError('올바른 반납 상태가 아닙니다.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [id]);
    if (!result.rowCount) throw new DomainError('대여 건을 찾을 수 없습니다.', 404);
    const loan = result.rows[0];
    if (loan.returned_at) throw new DomainError('이미 반납 처리된 대여 건입니다.', 409);
    await client.query(
      `UPDATE loans SET returned_at = now(), return_condition = $1, return_note = $2, returned_by = $3 WHERE id = $4`,
      [condition, String(input.note || '').slice(0, 500), actorId, id]
    );
    const restored = condition === 'LOST' ? 0 : loan.quantity;
    if (restored) await client.query('UPDATE items SET available_quantity = available_quantity + $1, updated_at = now() WHERE id = $2', [restored, loan.item_id]);
    await audit(client, actorId, 'ITEM_RETURNED', 'LOAN', id, { condition, restored });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { DomainError, positiveInteger, nonNegativeInteger, createItem, checkoutItem, returnItem };
