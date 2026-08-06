const state = { user: null, csrfToken: null, view: 'dashboard' };
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const date = value => value ? new Date(value).toLocaleDateString('ko-KR') : '-';
const isManager = () => ['MANAGER', 'ADMIN'].includes(state.user?.role);

async function request(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  let body;
  if (options.body) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(method === 'GET' ? options.body : { ...options.body, _csrf: state.csrfToken });
  }
  const response = await fetch(path, { ...options, method, headers, body, credentials: 'same-origin' });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login') showLogin();
    throw new Error(data.message || '요청을 처리하지 못했습니다.');
  }
  return data;
}

function showMessage(message, type = 'success') {
  const element = $('#global-message');
  element.textContent = message;
  element.className = `alert ${type}`;
  setTimeout(() => element.classList.add('hidden'), 3500);
}

function showLogin() {
  state.user = null;
  $('#app-shell').classList.add('hidden');
  $('#login-page').classList.remove('hidden');
}

function showApp() {
  $('#login-page').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  $('#user-name').textContent = state.user.displayName;
  $('#user-role').textContent = state.user.role;
  $('#top-user').textContent = `${state.user.displayName}님`;
  $('#audit-nav').classList.toggle('hidden', state.user.role !== 'ADMIN');
  navigate('dashboard');
}

async function boot() {
  try {
    const csrf = await request('/api/auth/csrf');
    state.csrfToken = csrf.csrfToken;
    const me = await request('/api/auth/me');
    state.user = me.user;
    state.csrfToken = me.csrfToken;
    showApp();
  } catch (_error) {
    showLogin();
  }
}

async function navigate(view) {
  state.view = view;
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#view-root').innerHTML = '<div class="loading">데이터를 불러오는 중입니다…</div>';
  try {
    if (view === 'dashboard') await renderDashboard();
    if (view === 'items') await renderItems();
    if (view === 'loans') await renderLoans();
    if (view === 'audit') await renderAudit();
    $('#main').focus();
  } catch (error) {
    $('#view-root').innerHTML = `<div class="empty"><h2>화면을 불러오지 못했습니다.</h2><p>${escapeHtml(error.message)}</p><button class="secondary" onclick="navigate('${view}')">다시 시도</button></div>`;
  }
}

async function renderDashboard() {
  const data = await request('/api/dashboard');
  const rows = data.items.map(item => `<tr><td class="mono">${escapeHtml(item.code)}</td><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.category)}</td><td>${item.available_quantity} / ${item.total_quantity}</td><td><span class="badge ${item.available_quantity <= item.min_quantity ? 'bad' : 'good'}">${item.available_quantity <= item.min_quantity ? '재고 부족' : '정상'}</span></td></tr>`).join('');
  $('#view-root').innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">FIELD COMMAND / 08.06</p><h1>현장 자산<br>지휘판</h1><p class="muted">오늘 조치할 재고와 대여 흐름부터 확인하세요.</p></div>${isManager() ? '<button class="primary" data-go="items">+ 신규 비품</button>' : ''}</div>
    <section class="command-hero"><div class="command-copy"><span>AVAILABLE EQUIPMENT / 실시간 가용 수량</span><strong>${data.items.reduce((sum,item) => sum + Number(item.available_quantity), 0)}</strong><span>모든 현장의 작업 가능 자산을 기준으로 집계</span></div><div class="command-signal"><div><strong>${data.stats.low_stock}</strong><span>LOW STOCK<br>즉시 확인</span></div></div></section>
    <section class="metric-strip"><article class="metric-feature"><span>등록 자산군</span><strong>${data.stats.total_items}</strong><small>운영 기준 품목</small></article><article><span>대여 중</span><strong>${data.stats.loaned}</strong><small>현장 사용 수량</small></article><article><span>반납 지연</span><strong>${data.stats.overdue}</strong><small>관리 필요 건</small></article><article class="metric-risk"><span>재고 부족</span><strong>${data.stats.low_stock}</strong><small>발주 검토 품목</small></article></section>
    <section class="panel"><div class="panel-head"><h2>비품 현황</h2><button class="link" data-go="items">전체 보기</button></div><div class="table-wrap"><table><thead><tr><th>코드</th><th>비품명</th><th>카테고리</th><th>가용/총수량</th><th>상태</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty-cell">등록된 비품이 없습니다.</td></tr>'}</tbody></table></div></section>`;
}

async function renderItems(query = '') {
  const data = await request(`/api/items?q=${encodeURIComponent(query)}`);
  const rows = data.items.map(item => `<tr><td class="mono">${escapeHtml(item.code)}</td><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.location || '-')}</td><td>${item.available_quantity}</td><td>${item.total_quantity}</td><td><span class="badge ${item.available_quantity <= item.min_quantity ? 'bad' : 'good'}">${item.available_quantity <= item.min_quantity ? '재고 부족' : '정상'}</span></td><td><button class="small item-detail-button" data-id="${item.id}">상세</button></td></tr>`).join('');
  $('#view-root').innerHTML = `
    <div class="catalogue-head"><div class="page-heading"><div><p class="eyebrow">EQUIPMENT CATALOGUE</p><h1>비품<br>인덱스</h1><p class="muted">현장 자산을 빠르게 찾고 재고 상태를 비교합니다.</p></div></div><section class="catalogue-search"><p class="eyebrow">FIND / FILTER</p><form id="item-search" class="search-panel"><input type="search" name="q" value="${escapeHtml(query)}" placeholder="코드 · 비품명 · 카테고리"><button class="secondary">검색</button></form></section></div>
    <section class="panel catalogue-table"><div class="table-wrap"><table><thead><tr><th>코드</th><th>비품명</th><th>카테고리</th><th>위치</th><th>가용</th><th>총수량</th><th>상태</th><th>관리</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="empty-cell">검색 결과가 없습니다.</td></tr>'}</tbody></table></div></section>
    ${isManager() ? `<section class="panel form-panel"><div><p class="eyebrow">NEW ITEM</p><h2>비품 등록</h2></div><form id="item-create" class="grid-form"><label>비품 코드<input name="code" required pattern="[A-Za-z0-9-]{3,30}"></label><label>비품명<input name="name" required minlength="2"></label><label>카테고리<input name="category" required></label><label>위치<input name="location" maxlength="100"></label><label>총수량<input type="number" name="totalQuantity" min="0" required></label><label>최소재고<input type="number" name="minQuantity" min="0" value="0" required></label><button class="primary">등록</button></form></section>` : ''}`;
  $('#item-search').addEventListener('submit', event => { event.preventDefault(); renderItems(new FormData(event.target).get('q')); });
  $('#item-create')?.addEventListener('submit', createItem);
  document.querySelectorAll('.item-detail-button').forEach(button => button.addEventListener('click', () => renderItemDetail(button.dataset.id)));
}

async function createItem(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  try {
    await request('/api/items', { method: 'POST', body: values });
    showMessage('비품을 등록했습니다.');
    await renderItems();
  } catch (error) { showMessage(error.message, 'error'); }
}

async function renderItemDetail(itemId) {
  try {
    const data = await request(`/api/items/${itemId}`);
    const item = data.item;
    const unavailable = Number(item.total_quantity) - Number(item.available_quantity);
    const activeLoaned = data.loans.filter(loan => !loan.returned_at).reduce((sum, loan) => sum + Number(loan.quantity), 0);
    const history = data.loans.map(loan => `<tr><td>${date(loan.loaned_at)}</td><td>${escapeHtml(loan.borrower_name)}</td><td>${loan.quantity}</td><td>${date(loan.due_at)}</td><td><span class="badge ${loan.returned_at ? 'good' : 'neutral'}">${loan.returned_at ? '반납 완료' : '대여 중'}</span></td></tr>`).join('');
    $('#view-root').innerHTML = `
      <div class="page-heading"><div><p class="eyebrow">ASSET SPECIFICATION / ${escapeHtml(item.code)}</p><h1>${escapeHtml(item.name)}</h1><p class="muted">현재 수량과 최근 인계 이력을 확인하고 관리 정보를 수정합니다.</p></div><button class="secondary" id="item-back">목록으로</button></div>
      <section class="asset-detail-shell"><aside class="asset-blueprint"><span class="mono">${escapeHtml(item.code)}</span><strong>${item.available_quantity}</strong><small>AVAILABLE / TOTAL ${item.total_quantity}</small></aside><div class="asset-facts"><dl><dt>카테고리</dt><dd>${escapeHtml(item.category)}</dd><dt>위치</dt><dd>${escapeHtml(item.location || '-')}</dd><dt>활성 대여</dt><dd>${activeLoaned}</dd><dt>가용 제외</dt><dd>${unavailable}</dd><dt>최소재고</dt><dd>${item.min_quantity}</dd><dt>상태</dt><dd>${escapeHtml(item.status)}</dd></dl></div></section>
      ${isManager() && item.status === 'ACTIVE' ? `<section class="panel form-panel"><div><p class="eyebrow">EDIT ITEM</p><h2>관리정보 수정</h2><p class="muted">총수량은 현재 가용 제외 수량 ${unavailable}개보다 작게 변경할 수 없습니다.</p></div><form id="item-update" class="grid-form"><label>비품명<input name="name" value="${escapeHtml(item.name)}" required minlength="2" maxlength="100"></label><label>카테고리<input name="category" value="${escapeHtml(item.category)}" required maxlength="50"></label><label>위치<input name="location" value="${escapeHtml(item.location || '')}" maxlength="100"></label><label>총수량<input type="number" name="totalQuantity" value="${item.total_quantity}" min="${unavailable}" required></label><label>최소재고<input type="number" name="minQuantity" value="${item.min_quantity}" min="0" required></label><button class="primary">수정 저장</button><button type="button" class="danger-button" id="item-deactivate">비품 비활성화</button></form></section>` : ''}
      <section class="panel"><div class="panel-head"><h2>최근 대여 이력</h2><span>${data.loans.length} RECORDS</span></div><div class="table-wrap"><table><thead><tr><th>대여일</th><th>대여자</th><th>수량</th><th>반납 예정</th><th>상태</th></tr></thead><tbody>${history || '<tr><td colspan="5" class="empty-cell">대여 이력이 없습니다.</td></tr>'}</tbody></table></div></section>`;
    $('#item-back').addEventListener('click', () => renderItems());
    $('#item-update')?.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        await request(`/api/items/${itemId}`, { method: 'PATCH', body: Object.fromEntries(new FormData(event.target)) });
        showMessage('비품 정보를 수정했습니다.');
        await renderItemDetail(itemId);
      } catch (error) { showMessage(error.message, 'error'); }
    });
    $('#item-deactivate')?.addEventListener('click', async () => {
      if (!window.confirm('이 비품을 목록에서 비활성화하시겠습니까?')) return;
      try {
        await request(`/api/items/${itemId}`, { method: 'DELETE', body: {} });
        showMessage('비품을 비활성화했습니다.');
        await renderItems();
      } catch (error) { showMessage(error.message, 'error'); }
    });
    $('#main').focus();
  } catch (error) {
    showMessage(error.message, 'error');
    await renderItems();
  }
}

async function renderLoans() {
  const data = await request('/api/loans');
  const rows = data.loans.map(loan => `<tr><td><strong>${escapeHtml(loan.item_name)}</strong><br><span class="mono">${escapeHtml(loan.code)}</span></td><td>${escapeHtml(loan.borrower_name)}</td><td>${loan.quantity}</td><td>${date(loan.due_at)}</td><td><span class="badge ${loan.returned_at ? 'good' : loan.overdue ? 'bad' : 'neutral'}">${loan.returned_at ? '반납 완료' : loan.overdue ? '연체' : '대여 중'}</span></td>${data.manager ? `<td>${loan.returned_at ? '' : `<button class="small return-button" data-id="${loan.id}">반납</button>`}</td>` : ''}</tr>`).join('');
  const userOptions = data.users.map(user => `<option value="${escapeHtml(user.email)}">${escapeHtml(user.display_name)} (${escapeHtml(user.email)})</option>`).join('');
  const itemOptions = data.items.map(item => `<option value="${item.id}">${escapeHtml(item.name)} · 가용 ${item.available_quantity}</option>`).join('');
  $('#view-root').innerHTML = `<div class="page-heading"><div><p class="eyebrow">HANDOVER WORKFLOW</p><h1>인계하고<br>회수하기</h1><p class="muted">대여 확정과 반납 처리를 하나의 흐름에서 기록합니다.</p></div></div>
    <div class="workflow-shell">${data.manager ? `<section class="panel form-panel"><div class="workflow-intro"><p class="eyebrow">STEP 01—04</p><h2>대여 처리</h2><p>담당자 → 비품 → 수량 → 반납일</p></div><form id="loan-create" class="grid-form"><label>01 대여자<select name="borrowerEmail" required><option value="">선택</option>${userOptions}</select></label><label>02 비품<select name="itemId" required><option value="">선택</option>${itemOptions}</select></label><label>03 수량<input type="number" name="quantity" min="1" value="1" required></label><label>04 반납 예정<input type="datetime-local" name="dueAt" required></label><button class="primary">대여 확정 →</button></form></section>` : ''}
    <section class="panel workflow-ledger"><div class="panel-head"><h2>이동 원장</h2><span>${data.loans.length} RECORDS</span></div><div class="table-wrap"><table><thead><tr><th>비품</th><th>대여자</th><th>수량</th><th>반납 예정</th><th>상태</th>${data.manager ? '<th>처리</th>' : ''}</tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty-cell">대여 이력이 없습니다.</td></tr>'}</tbody></table></div></section></div>`;
  $('#loan-create')?.addEventListener('submit', async event => { event.preventDefault(); try { await request('/api/loans', { method:'POST', body:Object.fromEntries(new FormData(event.target)) }); showMessage('대여 처리를 완료했습니다.'); renderLoans(); } catch(error){ showMessage(error.message,'error'); } });
  document.querySelectorAll('.return-button').forEach(button => button.addEventListener('click', async () => { try { await request(`/api/loans/${button.dataset.id}/return`, { method:'POST', body:{ condition:'GOOD' } }); showMessage('반납 처리를 완료했습니다.'); renderLoans(); } catch(error){ showMessage(error.message,'error'); } }));
}

async function renderAudit() {
  const data = await request('/api/audit');
  const rows = data.logs.map(log => `<tr><td>${new Date(log.created_at).toLocaleString('ko-KR')}</td><td>${escapeHtml(log.display_name || '시스템')}</td><td><span class="badge neutral">${escapeHtml(log.action)}</span></td><td>${escapeHtml(log.entity_type)} ${escapeHtml(log.entity_id || '')}</td><td class="mono details">${escapeHtml(log.request_id || '-')}<br>${escapeHtml(log.ip_address || '-')}</td><td class="mono details">${escapeHtml(JSON.stringify(log.metadata))}</td></tr>`).join('');
  $('#view-root').innerHTML = `<div class="page-heading"><div><p class="eyebrow">TRACE / GOVERNANCE / IMMUTABLE</p><h1>변경<br>원장</h1><p class="muted">누가, 언제, 무엇을 바꿨는지 시간 순서로 추적합니다.</p></div></div><section class="panel audit-ledger"><div class="panel-head"><h2>AUDIT TRAIL</h2><span class="mono">${data.logs.length} EVENTS</span></div><div class="table-wrap"><table><thead><tr><th>시각</th><th>작업자</th><th>작업</th><th>대상</th><th>요청 추적</th><th>세부정보</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const errorBox = $('#login-error');
  errorBox.classList.add('hidden');
  try {
    const data = await request('/api/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(event.target)) });
    state.user = data.user;
    state.csrfToken = data.csrfToken;
    event.target.reset();
    showApp();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('hidden');
  }
});

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
document.addEventListener('click', event => { const target = event.target.closest('[data-go]'); if (target) navigate(target.dataset.go); });
$('#logout-button').addEventListener('click', async () => { try { await request('/api/auth/logout', { method:'POST', body:{} }); } finally { const csrf = await request('/api/auth/csrf'); state.csrfToken = csrf.csrfToken; showLogin(); } });

boot();
