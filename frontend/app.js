const state = { user: null, csrfToken: null, view: 'dashboard', reference: null };
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
    if (response.status === 401 && !['/api/auth/login','/api/auth/mfa/verify'].includes(path)) showLogin();
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
  $('#mfa-login-form').classList.add('hidden');
  $('#login-form').classList.remove('hidden');
}

function showInvitation(token) {
  showLogin();
  $('#login-form').classList.add('hidden');
  $('#invitation-form').classList.remove('hidden');
  $('#invitation-form').elements.token.value = token;
}

function showApp() {
  $('#login-page').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  $('#user-name').textContent = state.user.displayName;
  $('#user-role').textContent = state.user.role;
  $('#top-user').textContent = `${state.user.displayName}님`;
  $('#audit-nav').classList.toggle('hidden', state.user.role !== 'ADMIN');
  document.querySelectorAll('[data-manager-only]').forEach(element => element.classList.toggle('hidden', !isManager()));
  document.querySelectorAll('[data-admin-only]').forEach(element => element.classList.toggle('hidden', state.user.role !== 'ADMIN'));
  navigate('dashboard');
}

async function boot() {
  try {
    const csrf = await request('/api/auth/csrf');
    state.csrfToken = csrf.csrfToken;
    const invitationToken = location.hash.startsWith('#invitation=') ? decodeURIComponent(location.hash.slice('#invitation='.length)) : '';
    if (invitationToken) return showInvitation(invitationToken);
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
    if (view === 'assets') await renderAssets();
    if (view === 'asset-register') await renderAssetRegister();
    if (view === 'assignments') await renderAssignments();
    if (view === 'requests') await renderRequests();
    if (view === 'stocktakes') await renderStocktakes();
    if (view === 'repairs') await renderRepairs();
    if (view === 'reports') await renderReports();
    if (view === 'admin') await renderAdmin();
    if (view === 'items') await renderItems();
    if (view === 'loans') await renderLoans();
    if (view === 'audit') await renderAudit();
    if (view === 'security') await renderSecurity();
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

async function reference() {
  if (!state.reference) state.reference = await request('/api/enterprise/reference');
  return state.reference;
}

const options = (rows, label, selected = '') => rows.map(row => `<option value="${row.id}" ${String(row.id) === String(selected) ? 'selected' : ''}>${escapeHtml(label(row))}</option>`).join('');
const statusBadge = value => `<span class="badge ${['AVAILABLE','APPROVED','MATCH','ACTIVE','RESOLVED'].includes(value) ? 'good' : ['LOST','REJECTED','MISSING','DAMAGED'].includes(value) ? 'bad' : 'neutral'}">${escapeHtml(value)}</span>`;

async function renderAssets(query = '') {
  const data = await request(`/api/enterprise/assets?q=${encodeURIComponent(query)}`);
  const rows = data.assets.map(asset => `<tr><td class="mono">${escapeHtml(asset.asset_tag)}</td><td><strong>${escapeHtml(asset.name)}</strong><br><small>${escapeHtml(asset.serial_no || '-')}</small></td><td>${escapeHtml(asset.category_name || '-')}</td><td>${escapeHtml(asset.location_name || '-')}</td><td>${statusBadge(asset.status_code)}</td><td><button class="small enterprise-asset-detail" data-id="${asset.id}">상세</button></td></tr>`).join('');
  $('#view-root').innerHTML = `<div class="page-heading"><div><p class="eyebrow">ASSET REGISTER / INDIVIDUAL CONTROL</p><h1>기업 자산<br>통합 원장</h1><p class="muted">개별 자산번호, 일련번호, 위치와 전체 상태 이력을 한곳에서 조회합니다.</p></div>${isManager() ? '<button class="primary" data-go="asset-register">+ 자산 등록</button>' : ''}</div>
  <section class="panel"><form id="asset-search" class="search-panel"><input type="search" name="q" value="${escapeHtml(query)}" placeholder="자산번호 · 자산명 · 일련번호"><button class="secondary">검색</button></form><div class="table-wrap"><table><thead><tr><th>자산번호</th><th>자산</th><th>분류</th><th>위치</th><th>상태</th><th>관리</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty-cell">조건에 맞는 자산이 없습니다.</td></tr>'}</tbody></table></div></section>`;
  $('#asset-search').addEventListener('submit', event => { event.preventDefault(); renderAssets(new FormData(event.target).get('q')); });
  document.querySelectorAll('.enterprise-asset-detail').forEach(button => button.addEventListener('click', () => renderAssetDetail(button.dataset.id)));
}

async function renderAssetDetail(id) {
  const [data,ref] = await Promise.all([request(`/api/enterprise/assets/${id}`),reference()]); const asset = data.asset;
  const statusOptions=ref.statuses.map(row=>`<option value="${escapeHtml(row.code)}">${escapeHtml(`${row.name} · ${row.code}`)}</option>`).join(''); const reasonOptions=ref.reasons.map(row=>`<option value="${escapeHtml(row.code)}">${escapeHtml(row.applies_to_status?`${row.name} · ${row.applies_to_status}`:row.name)}</option>`).join('');
  const history = data.history.map(row => `<tr><td>${date(row.created_at)}</td><td>${escapeHtml(row.from_status || '신규')}</td><td>${statusBadge(row.to_status)}</td><td>${escapeHtml(row.reason)}</td></tr>`).join('');
  const assignments = data.assignments.map(row => `<tr><td>${escapeHtml(row.display_name || '-')}</td><td>${date(row.started_at)}</td><td>${date(row.ended_at)}</td><td>${statusBadge(row.status)}</td></tr>`).join('');
  const files = data.files.map(row => `<li class="evidence-row"><div><strong>${escapeHtml(row.original_name)}</strong><small>${escapeHtml(row.file_type)} · ${Math.ceil(Number(row.size_bytes || 0)/1024)} KiB · ${date(row.created_at)}</small></div><div><a class="small button-link" href="/api/enterprise/assets/${id}/files/${row.id}/download">다운로드</a>${isManager()?`<button class="small evidence-deactivate" data-file-id="${row.id}">비활성화</button>`:''}</div></li>`).join('');
  $('#view-root').innerHTML = `<div class="page-heading"><div><p class="eyebrow">ASSET / ${escapeHtml(asset.asset_tag)}</p><h1>${escapeHtml(asset.name)}</h1><p class="muted">일련번호 ${escapeHtml(asset.serial_no || '-')} · 취득일 ${date(asset.acquired_at)}</p></div><button id="assets-back" class="secondary">목록</button></div>
  <section class="asset-detail-shell"><aside class="asset-blueprint"><span class="mono">${escapeHtml(asset.asset_tag)}</span><strong>${escapeHtml(asset.status_code)}</strong><small>CURRENT STATE</small></aside><div class="asset-facts"><dl><dt>취득가</dt><dd>${Number(asset.acquisition_cost || 0).toLocaleString()}원</dd><dt>부서 ID</dt><dd>${asset.department_id || '-'}</dd><dt>위치 ID</dt><dd>${asset.location_id || '-'}</dd><dt>등록일</dt><dd>${date(asset.created_at)}</dd></dl></div></section>
  ${isManager() ? `<section class="panel form-panel"><div><p class="eyebrow">STATE COMMAND</p><h2>상태 전환</h2><p class="muted">활성 상태와 승인된 사유만 사용할 수 있습니다.</p></div><form id="asset-status" class="grid-form"><label>다음 상태<select name="toStatus" required><option value="">선택</option>${statusOptions}</select></label><label>변경 사유<select name="reasonCode" required><option value="">선택</option>${reasonOptions}</select></label><label>추가 설명<input name="reasonDetail" maxlength="500" aria-describedby="reason-help"><small id="reason-help">사유 정책에 따라 필수일 수 있습니다.</small></label><button class="primary">상태 변경</button></form></section>` : ''}
  <section class="panel evidence-panel"><div class="panel-head"><div><p class="eyebrow">EVIDENCE VAULT</p><h2>자산 증빙파일</h2></div><span>${data.files.length} FILES</span></div>${files?`<ul class="evidence-list">${files}</ul>`:'<div class="empty-cell">등록된 증빙파일이 없습니다.</div>'}${isManager()?`<form id="evidence-upload" class="grid-form evidence-form"><label>증빙 유형<select name="fileType" required><option>PHOTO</option><option>RECEIPT</option><option>INSPECTION</option><option>DISPOSAL</option></select></label><label>파일 선택<input name="evidence" type="file" accept="image/jpeg,image/png,application/pdf" required aria-describedby="evidence-help"><small id="evidence-help">JPEG, PNG, PDF · 최대 5 MiB</small></label><button class="primary">증빙 업로드</button></form>`:''}</section>
  <section class="two-column"><article class="panel"><div class="panel-head"><h2>상태 이력</h2></div><div class="table-wrap"><table><thead><tr><th>일자</th><th>이전</th><th>이후</th><th>사유</th></tr></thead><tbody>${history || '<tr><td colspan="4">이력이 없습니다.</td></tr>'}</tbody></table></div></article><article class="panel"><div class="panel-head"><h2>배정 이력</h2></div><div class="table-wrap"><table><thead><tr><th>사용자</th><th>시작</th><th>종료</th><th>상태</th></tr></thead><tbody>${assignments || '<tr><td colspan="4">이력이 없습니다.</td></tr>'}</tbody></table></div></article></section>`;
  $('#assets-back').addEventListener('click', () => renderAssets());
  const reasonSelect=$('#asset-status select[name="reasonCode"]'); const detailInput=$('#asset-status input[name="reasonDetail"]');
  reasonSelect?.addEventListener('change',()=>{const policy=ref.reasons.find(row=>row.code===reasonSelect.value);detailInput.required=Boolean(policy?.requires_detail);detailInput.placeholder=detailInput.required?'2자 이상 필수':'선택 입력';});
  $('#asset-status')?.addEventListener('submit', async event => { event.preventDefault(); try { await request(`/api/enterprise/assets/${id}/status`, { method:'POST', body:Object.fromEntries(new FormData(event.target)) }); showMessage('자산 상태를 변경했습니다.'); renderAssetDetail(id); } catch (error) { showMessage(error.message, 'error'); } });
  $('#evidence-upload')?.addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;const file=event.target.elements.evidence.files[0];if(!file)return;button.disabled=true;try{const response=await fetch(`/api/enterprise/assets/${id}/files`,{method:'POST',credentials:'same-origin',headers:{'content-type':file.type,'x-file-name':encodeURIComponent(file.name),'x-file-type':event.target.elements.fileType.value,'x-csrf-token':state.csrfToken},body:await file.arrayBuffer()});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.message||'증빙파일을 업로드하지 못했습니다.');showMessage('증빙파일을 업로드했습니다.');await renderAssetDetail(id);}catch(error){showMessage(error.message,'error');}finally{button.disabled=false;}});
  document.querySelectorAll('.evidence-deactivate').forEach(button=>button.addEventListener('click',async()=>{if(!window.confirm('파일을 감사 보존 상태로 비활성화하시겠습니까?'))return;try{await request(`/api/enterprise/assets/${id}/files/${button.dataset.fileId}/deactivate`,{method:'POST',body:{}});showMessage('증빙파일을 비활성화했습니다.');await renderAssetDetail(id);}catch(error){showMessage(error.message,'error');}}));
}

async function renderAssetRegister() {
  if (!isManager()) throw new Error('자산 등록 권한이 없습니다.'); const ref = await reference();
  $('#view-root').innerHTML = `<div class="page-heading"><div><p class="eyebrow">FIVE STEP ONBOARDING</p><h1>신규 자산<br>등록</h1><p class="muted">식별·분류·배치·취득·검토 순서로 누락 없이 등록합니다.</p></div></div><section class="panel step-panel"><div class="step-line"><span>01 식별</span><span>02 분류</span><span>03 배치</span><span>04 취득</span><span>05 검토</span></div><form id="asset-create" class="grid-form enterprise-form"><label>자산번호<input name="assetTag" required pattern="[A-Z0-9-]{3,50}" placeholder="IT-2026-004"></label><label>자산명<input name="name" required minlength="2"></label><label>일련번호<input name="serialNo"></label><label>분류<select name="categoryId"><option value="">선택</option>${options(ref.categories, row => `${row.code} · ${row.name}`)}</select></label><label>모델<select name="modelId"><option value="">선택</option>${options(ref.models, row => `${row.brand || ''} ${row.model_name}`)}</select></label><label>부서<select name="departmentId"><option value="">선택</option>${options(ref.departments, row => row.name)}</select></label><label>위치<select name="locationId"><option value="">선택</option>${options(ref.locations, row => row.name)}</select></label><label>취득일<input type="date" name="acquiredAt"></label><label>취득가<input type="number" name="acquisitionCost" min="0"></label><label>초기 상태<select name="statusCode"><option>AVAILABLE</option><option>DRAFT</option><option>RECEIVED</option></select></label><button class="primary full">자산 등록 완료</button></form></section>`;
  $('#asset-create').addEventListener('submit', async event => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.target)); body.organizationId = state.user.organizationId; try { await request('/api/enterprise/assets', { method:'POST', body }); showMessage('신규 자산을 등록했습니다.'); navigate('assets'); } catch(error) { showMessage(error.message, 'error'); } });
}

async function renderAssignments() {
  const [ref, data] = await Promise.all([reference(), request('/api/enterprise/requests')]);
  const relevant = data.requests.filter(row => ['ASSIGN','RETURN','TRANSFER'].includes(row.request_type));
  const rows = relevant.map(row => `<tr><td>#${row.id}</td><td>${escapeHtml(row.request_type)}</td><td>${escapeHtml(row.asset_tag || '-')}</td><td>${escapeHtml(row.requester_name)}</td><td>${statusBadge(row.status)}</td><td>${row.status === 'DRAFT' ? `<button class="small request-action" data-id="${row.id}" data-action="SUBMIT">제출</button>` : ''}</td></tr>`).join('');
  $('#view-root').innerHTML = `<div class="page-heading"><div><p class="eyebrow">HANDOVER / RETURN / TRANSFER</p><h1>배정과 반납<br>워크플로</h1><p class="muted">요청과 승인 결과가 자산 상태·배정 이력에 하나의 트랜잭션으로 반영됩니다.</p></div></div><section class="workflow-shell"><article class="panel form-panel"><div><p class="eyebrow">NEW REQUEST</p><h2>인수인계 요청</h2></div><form id="assignment-request" class="grid-form"><label>유형<select name="requestType"><option>ASSIGN</option><option>RETURN</option><option>TRANSFER</option></select></label><label>자산<select name="assetId" required><option value="">선택</option>${options((await request('/api/enterprise/assets?size=100')).assets, row => `${row.asset_tag} · ${row.name}`)}</select></label><label>요청 제목<input name="title" value="자산 인수인계" required></label><label>사유<input name="reason" required minlength="2"></label><label>대상 사용자<select name="assigneeUserId"><option value="">요청자 본인</option>${options(ref.users, row => `${row.display_name} · ${row.role}`)}</select></label><button class="primary">초안 생성</button></form></article><article class="panel"><div class="panel-head"><h2>배정 요청 원장</h2></div><div class="table-wrap"><table><thead><tr><th>번호</th><th>유형</th><th>자산</th><th>요청자</th><th>상태</th><th>처리</th></tr></thead><tbody>${rows || '<tr><td colspan="6">요청이 없습니다.</td></tr>'}</tbody></table></div></article></section>`;
  $('#assignment-request').addEventListener('submit', event => createWorkflowRequest(event)); bindRequestActions(renderAssignments);
}

async function createWorkflowRequest(event) {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.target));
  const payload = {}; if (values.assigneeUserId) payload.assigneeUserId = Number(values.assigneeUserId); delete values.assigneeUserId;
  values.organizationId = state.user.organizationId; values.payload = payload;
  try { await request('/api/enterprise/requests', { method:'POST', body:values }); showMessage('요청 초안을 만들었습니다.'); await renderAssignments(); } catch(error) { showMessage(error.message,'error'); }
}

function bindRequestActions(refresh) { document.querySelectorAll('.request-action').forEach(button => button.addEventListener('click', async () => { try { await request(`/api/enterprise/requests/${button.dataset.id}/action`, { method:'POST', body:{ action:button.dataset.action, reviewReason: button.dataset.action === 'REJECT' ? '요건 보완 필요' : '검토 완료' } }); showMessage('요청 상태를 변경했습니다.'); refresh(); } catch(error) { showMessage(error.message,'error'); } })); }

async function renderRequests() {
  const data = await request('/api/enterprise/requests');
  const rows = data.requests.map(row => { const purchase = row.request_type === 'PURCHASE' ? `<br><small>품목 ${escapeHtml(row.payload?.itemName || '-')} · ${Number(row.payload?.quantity || 0).toLocaleString()}개 · ${Number(row.payload?.estimatedAmount || 0).toLocaleString()}원 · ${escapeHtml(row.payload?.costCenter || '-')} · 필요 ${escapeHtml(row.payload?.neededAt || '-')}</small>` : ''; const progress=Number(row.approval_step_count||0)?`${row.status==='APPROVED'?row.approval_step_count:Math.max(0,Number(row.current_approval_step||1)-1)} / ${row.approval_step_count}`:'제출 전'; return `<tr><td>#${row.id}</td><td>${escapeHtml(row.request_type)}</td><td><strong>${escapeHtml(row.title)}</strong><br><small>${escapeHtml(row.reason)}</small>${purchase}</td><td>${escapeHtml(row.requester_name)}</td><td>${statusBadge(row.status)}</td><td>${escapeHtml(progress)}</td><td>${row.status === 'DRAFT' && row.requester_id === state.user.id ? `<button class="small request-action" data-id="${row.id}" data-action="SUBMIT">제출</button>` : ''}${isManager() && row.status === 'SUBMITTED' && row.requester_id !== state.user.id ? `<button class="small request-action" data-id="${row.id}" data-action="APPROVE">현재 단계 승인</button><button class="small danger-button request-action" data-id="${row.id}" data-action="REJECT">반려</button>` : ''}</td></tr>`; }).join('');
  let procurementPanel = '';
  if (isManager()) {
    const [procurement, ref] = await Promise.all([request('/api/enterprise/procurement'), reference()]);
    const orderedRequestIds = new Set(procurement.orders.map(order => Number(order.request_id)));
    const approvedRequests = procurement.requests.filter(row => row.status === 'APPROVED' && !orderedRequestIds.has(Number(row.id)));
    const activeOrders = procurement.orders.filter(row => row.status !== 'CANCELLED');
    const pendingReceipts = procurement.receipts.filter(row => row.status === 'INSPECTION_PENDING');
    const orderRows = procurement.orders.map(row => `<tr><td>${escapeHtml(row.order_no)}</td><td>#${row.request_id}</td><td>${Number(row.total_amount).toLocaleString()}원</td><td>${statusBadge(row.status)}</td></tr>`).join('');
    const receiptRows = procurement.receipts.map(row => `<tr><td>#${row.id}</td><td>#${row.purchase_order_id}</td><td>${row.quantity}개</td><td>${statusBadge(row.status)}</td></tr>`).join('');
    procurementPanel = `<section class="panel form-panel"><div><p class="eyebrow">PURCHASE &amp; INSPECTION</p><h2>발주·입고·검수</h2><p class="muted">검수 합격 전에는 자산이 생성되지 않아 배정할 수 없습니다.</p></div><div class="workflow-shell"><form id="purchase-order" class="grid-form"><label>승인 구매요청<select name="requestId" required><option value="">선택</option>${options(approvedRequests, row => `#${row.id} · ${row.title}`)}</select></label><label>공급사<select name="vendorId"><option value="">미지정</option>${options(ref.vendors, row => row.name)}</select></label><label>발주번호<input name="orderNo" required pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,49}"></label><label>발주금액<input type="number" name="totalAmount" required min="0.01" step="0.01"></label><button class="primary">발주 생성</button></form><form id="purchase-receipt" class="grid-form"><label>발주<select name="purchaseOrderId" required><option value="">선택</option>${options(activeOrders, row => `${row.order_no} · ${row.status}`)}</select></label><label>입고수량<input type="number" name="quantity" required min="1" step="1"></label><button class="primary">부분 입고</button></form><form id="purchase-inspection" class="grid-form"><label>검수대기 입고<select name="receiptId" required><option value="">선택</option>${options(pendingReceipts, row => `입고 #${row.id} · ${row.quantity}개`)}</select></label><label>결과<select name="result"><option>PASS</option><option>FAIL</option><option>CONDITIONAL</option></select></label><label>검수 메모<input name="note" maxlength="500"></label><button class="primary">검수 완료</button></form></div><div class="workflow-shell"><div class="table-wrap"><table><thead><tr><th>발주</th><th>요청</th><th>금액</th><th>상태</th></tr></thead><tbody>${orderRows || '<tr><td colspan="4">발주가 없습니다.</td></tr>'}</tbody></table></div><div class="table-wrap"><table><thead><tr><th>입고</th><th>발주</th><th>수량</th><th>상태</th></tr></thead><tbody>${receiptRows || '<tr><td colspan="4">입고가 없습니다.</td></tr>'}</tbody></table></div></div></section>`;
  }
  $('#view-root').innerHTML = `<div class="page-heading"><div><p class="eyebrow">APPROVAL INBOX / SEGREGATION OF DUTIES</p><h1>요청·승인<br>통합함</h1><p class="muted">본인 승인 금지와 조직 범위 권한을 적용한 순차 승인 큐입니다.</p></div></div><section class="panel form-panel"><div><p class="eyebrow">PURCHASE REQUEST</p><h2>구매 요청 초안</h2><p class="muted">검토에 필요한 품목·수량·금액·비용센터·필요일을 모두 입력하세요.</p></div><form id="purchase-request" class="grid-form enterprise-form"><label>품목<input name="itemName" required minlength="2" maxlength="150"></label><label>수량<input type="number" name="quantity" required min="1" max="100000" step="1"></label><label>예상금액<input type="number" name="estimatedAmount" required min="0.01" step="0.01"></label><label>비용센터<input name="costCenter" required minlength="2" maxlength="50" pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,49}" placeholder="HQ-001"></label><label>필요일<input type="date" name="neededAt" required></label><label>요청 사유<input name="reason" required minlength="2" maxlength="1000"></label><button class="primary full">구매 요청 초안 생성</button></form></section>${procurementPanel}<section class="panel"><div class="table-wrap"><table><thead><tr><th>번호</th><th>유형</th><th>요청</th><th>요청자</th><th>상태</th><th>승인 단계</th><th>처리</th></tr></thead><tbody>${rows || '<tr><td colspan="7">요청이 없습니다.</td></tr>'}</tbody></table></div></section>`;
  $('#purchase-request').addEventListener('submit', async event => { event.preventDefault(); const values=Object.fromEntries(new FormData(event.target)); const body={ organizationId:state.user.organizationId, requestType:'PURCHASE', title:`구매 요청: ${values.itemName.trim()}`, reason:values.reason, payload:{ itemName:values.itemName, quantity:values.quantity, estimatedAmount:values.estimatedAmount, costCenter:values.costCenter, neededAt:values.neededAt } }; try { await request('/api/enterprise/requests',{method:'POST',body}); showMessage('구매 요청 초안을 생성했습니다.'); renderRequests(); } catch(error){ showMessage(error.message,'error'); } }); bindRequestActions(renderRequests);
  for (const [formId, path, success] of [['purchase-order','/api/enterprise/procurement/orders','발주를 생성했습니다.'],['purchase-receipt','/api/enterprise/procurement/receipts','입고를 기록했습니다.'],['purchase-inspection','/api/enterprise/procurement/inspections','검수를 완료했습니다.']]) {
    $(`#${formId}`)?.addEventListener('submit', async event => { event.preventDefault(); const body=Object.fromEntries(new FormData(event.target)); body.organizationId=state.user.organizationId; try { const result=await request(path,{method:'POST',body}); const count=result.assets?.length || 0; showMessage(count ? `${success} 자산 ${count}개를 생성했습니다.` : success); renderRequests(); } catch(error){ showMessage(error.message,'error'); } });
  }
}

async function renderStocktakes() {
  if (!isManager()) throw new Error('재물조사 권한이 없습니다.'); const [ref, data] = await Promise.all([reference(), request('/api/enterprise/stocktakes')]);
  const rows = data.stocktakes.map(row => `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.location_name || '전체')}</td><td>${date(row.planned_at)}</td><td>${row.item_count}</td><td>${row.mismatch_count}</td><td>${statusBadge(row.status)}</td><td><button class="small stocktake-open" data-id="${row.id}">조사</button></td></tr>`).join('');
  $('#view-root').innerHTML = `<div class="page-heading"><div><p class="eyebrow">PHYSICAL INVENTORY</p><h1>재물조사<br>대조 보드</h1><p class="muted">시스템 원장과 현장 실물을 대조하고 불일치를 확정합니다.</p></div></div><section class="panel form-panel"><div><h2>조사 계획</h2></div><form id="stocktake-create" class="grid-form"><label>조사명<input name="name" required minlength="2"></label><label>예정일<input type="datetime-local" name="plannedAt" required></label><label>위치<select name="locationId"><option value="">전체</option>${options(ref.locations, row => row.name)}</select></label><button class="primary">조사 생성</button></form></section><section class="panel"><div class="table-wrap"><table><thead><tr><th>조사</th><th>위치</th><th>예정일</th><th>대상</th><th>불일치</th><th>상태</th><th>실행</th></tr></thead><tbody>${rows || '<tr><td colspan="7">조사 계획이 없습니다.</td></tr>'}</tbody></table></div></section>`;
  $('#stocktake-create').addEventListener('submit', async event => { event.preventDefault(); const body=Object.fromEntries(new FormData(event.target)); body.organizationId=state.user.organizationId; try { await request('/api/enterprise/stocktakes',{method:'POST',body}); showMessage('재물조사를 생성했습니다.'); renderStocktakes(); } catch(error){ showMessage(error.message,'error'); } }); document.querySelectorAll('.stocktake-open').forEach(button=>button.addEventListener('click',()=>renderStocktakeDetail(button.dataset.id)));
}

async function renderStocktakeDetail(id) {
  const data=await request(`/api/enterprise/stocktakes/${id}`); const rows=data.items.map(row=>`<tr><td class="mono">${escapeHtml(row.asset_tag)}</td><td>${escapeHtml(row.name)}</td><td>${statusBadge(row.result)}</td><td><select class="stock-result" data-asset="${row.asset_id}"><option>MATCH</option><option>MISSING</option><option>LOCATION_MISMATCH</option><option>DAMAGED</option></select><button class="small stock-save" data-asset="${row.asset_id}">저장</button></td></tr>`).join(''); $('#view-root').innerHTML=`<div class="page-heading"><div><p class="eyebrow">STOCKTAKE #${id}</p><h1>${escapeHtml(data.stocktake.name)}</h1></div><button class="secondary" data-go="stocktakes">목록</button></div><section class="panel"><div class="table-wrap"><table><thead><tr><th>자산번호</th><th>자산명</th><th>결과</th><th>확인</th></tr></thead><tbody>${rows}</tbody></table></div><button id="stock-confirm" class="primary">조사 확정</button></section>`; document.querySelectorAll('.stock-save').forEach(button=>button.addEventListener('click',async()=>{const result=document.querySelector(`.stock-result[data-asset="${button.dataset.asset}"]`).value;try{await request(`/api/enterprise/stocktakes/${id}/items/${button.dataset.asset}`,{method:'POST',body:{result}});showMessage('조사 결과를 저장했습니다.');renderStocktakeDetail(id);}catch(error){showMessage(error.message,'error');}})); $('#stock-confirm').addEventListener('click',async()=>{try{await request(`/api/enterprise/stocktakes/${id}/confirm`,{method:'POST',body:{}});showMessage('재물조사를 확정했습니다.');renderStocktakes();}catch(error){showMessage(error.message,'error');}});
}

async function renderRepairs() {
  const [assets,data]=await Promise.all([request('/api/enterprise/assets?size=100'),request('/api/enterprise/repairs')]); const rows=data.repairs.map(row=>`<tr><td>#${row.id}</td><td>${escapeHtml(row.asset_tag)} · ${escapeHtml(row.asset_name)}</td><td>${escapeHtml(row.symptom)}</td><td>${statusBadge(row.status)}</td><td>${isManager()?`<button class="small repair-progress" data-id="${row.id}">진행</button>`:''}</td></tr>`).join(''); $('#view-root').innerHTML=`<div class="page-heading"><div><p class="eyebrow">SERVICE DESK</p><h1>수리·장애<br>서비스 보드</h1><p class="muted">고장 접수부터 해결과 비용까지 추적합니다.</p></div></div><section class="panel form-panel"><div><h2>고장 접수</h2></div><form id="repair-create" class="grid-form"><label>자산<select name="assetId" required><option value="">선택</option>${options(assets.assets,row=>`${row.asset_tag} · ${row.name}`)}</select></label><label>우선순위<select name="priority"><option>NORMAL</option><option>HIGH</option><option>CRITICAL</option><option>LOW</option></select></label><label>증상<input name="symptom" required minlength="2"></label><button class="primary">접수</button></form></section><section class="panel"><div class="table-wrap"><table><thead><tr><th>번호</th><th>자산</th><th>증상</th><th>상태</th><th>처리</th></tr></thead><tbody>${rows||'<tr><td colspan="5">수리 건이 없습니다.</td></tr>'}</tbody></table></div></section>`; $('#repair-create').addEventListener('submit',async event=>{event.preventDefault();try{await request('/api/enterprise/repairs',{method:'POST',body:Object.fromEntries(new FormData(event.target))});showMessage('수리 건을 접수했습니다.');renderRepairs();}catch(error){showMessage(error.message,'error');}}); document.querySelectorAll('.repair-progress').forEach(button=>button.addEventListener('click',async()=>{try{await request(`/api/enterprise/repairs/${button.dataset.id}/status`,{method:'POST',body:{status:'IN_PROGRESS',organizationId:state.user.organizationId}});showMessage('수리 상태를 변경했습니다.');renderRepairs();}catch(error){showMessage(error.message,'error');}}));
}

async function renderReports(filters = {}) {
  if(!isManager()) throw new Error('보고서 권한이 없습니다.');
  const query = new URLSearchParams(Object.entries(filters).filter(([,value]) => value)).toString();
  const [data, ref] = await Promise.all([request(`/api/enterprise/reports/assets${query ? `?${query}` : ''}`), reference()]); const s=data.summary;
  const dimension = (title, rows) => `<article class="panel"><div class="panel-head"><h2>${title}</h2></div><div class="table-wrap"><table><thead><tr><th>구분</th><th>자산</th><th>취득가</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${escapeHtml(row.label)}</td><td>${row.count}</td><td>${Number(row.total_cost||0).toLocaleString()}원</td></tr>`).join('')||'<tr><td colspan="3">결과가 없습니다.</td></tr>'}</tbody></table></div></article>`;
  const statuses=['AVAILABLE','ASSIGNED','IN_USE','REPAIR','LOST','DISPOSE_PENDING','DISPOSED','RETURNED'];
  $('#view-root').innerHTML=`<div class="page-heading"><div><p class="eyebrow">MULTI-DIMENSION ASSET REPORT</p><h1>자산 운영<br>보고서</h1><p class="muted">부서·위치·유형·상태·취득기간을 같은 기준으로 집계합니다.</p></div><a class="primary button-link" href="/api/enterprise/reports/assets.csv${query ? `?${query}` : ''}">필터 결과 CSV</a></div><section class="panel form-panel"><div><h2>보고 조건</h2><p class="muted">조건을 비우면 전체 조직을 조회합니다.</p></div><form id="report-filter" class="grid-form enterprise-form"><label>부서<select name="departmentId"><option value="">전체</option>${options(ref.departments,row=>row.name,filters.departmentId)}</select></label><label>위치<select name="locationId"><option value="">전체</option>${options(ref.locations,row=>row.name,filters.locationId)}</select></label><label>유형<select name="categoryId"><option value="">전체</option>${options(ref.categories,row=>row.name,filters.categoryId)}</select></label><label>상태<select name="status"><option value="">전체</option>${statuses.map(status=>`<option ${filters.status===status?'selected':''}>${status}</option>`).join('')}</select></label><label>취득 시작일<input type="date" name="from" value="${escapeHtml(filters.from||'')}"></label><label>취득 종료일<input type="date" name="to" value="${escapeHtml(filters.to||'')}"></label><button class="primary full">보고서 조회</button></form></section><section class="metric-strip"><article class="metric-feature"><span>필터 자산</span><strong>${s.assets}</strong></article><article><span>가용</span><strong>${s.available}</strong></article><article><span>사용 중</span><strong>${s.in_use}</strong></article><article class="metric-risk"><span>수리 / 분실 / 폐기대기</span><strong>${Number(s.repair)+Number(s.lost)+Number(s.dispose_pending)}</strong></article></section><section class="panel report-amount"><p class="eyebrow">FILTERED ACQUISITION VALUE</p><h2>${Number(s.total_cost||0).toLocaleString()}원</h2></section><section class="two-column">${dimension('부서별',data.breakdowns.departments)}${dimension('위치별',data.breakdowns.locations)}${dimension('유형별',data.breakdowns.categories)}${dimension('상태별',data.breakdowns.statuses)}</section>`;
  $('#report-filter').addEventListener('submit',event=>{event.preventDefault();renderReports(Object.fromEntries(new FormData(event.target)));});
}

async function renderAdmin() {
  if(state.user.role!=='ADMIN') throw new Error('관리자 권한이 없습니다.');
  const [data,referenceData,policyData]=await Promise.all([request('/api/enterprise/admin'),request('/api/enterprise/admin/references'),request('/api/enterprise/admin/approval-policies')]);
  const refs=referenceData.references;
  const departments=data.departments.filter(row=>Number(row.organization_id)===Number(state.user.organizationId));
  const users=data.users.map(user=>`<tr><td>${escapeHtml(user.display_name)}</td><td>${escapeHtml(user.email)}</td><td>${statusBadge(user.role)}</td><td>${statusBadge(user.scope_type||'-')}</td><td>${statusBadge(user.status)}</td><td>${user.mfa_enabled?'사용':'미사용'}</td></tr>`).join('');
  const units=departments.map(row=>`<tr><td>${statusBadge(row.unit_type)}</td><td>${escapeHtml(row.code)}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.cost_center||'-')}</td></tr>`).join('');
  const invitations=data.invitations.filter(row=>Number(row.organization_id)===Number(state.user.organizationId)).map(row=>{const status=row.accepted_at?'수락':row.revoked_at?'취소':new Date(row.expires_at)<new Date()?'만료':'대기';return `<tr><td>${escapeHtml(row.display_name)}<br><small>${escapeHtml(row.email)}</small></td><td>${statusBadge(row.role)}</td><td>${escapeHtml(row.department_name||'조직 전체')}</td><td>${statusBadge(status)}</td></tr>`;}).join('');
  const events=data.outbox.map(row=>`<tr><td>${date(row.created_at)}</td><td>${escapeHtml(row.aggregate_type)} #${escapeHtml(row.aggregate_id)}</td><td>${escapeHtml(row.event_type)}</td><td>${row.published_at?'발행':'대기'}</td></tr>`).join('');
  const policyRows=policyData.policies.map(policy=>`<tr><td>${escapeHtml(policy.request_type)}</td><td>${escapeHtml(policy.name)}</td><td>${policy.amount_min==null&&policy.amount_max==null?'전체':`${Number(policy.amount_min||0).toLocaleString()}~${policy.amount_max==null?'∞':Number(policy.amount_max).toLocaleString()}원`}</td><td>${policy.steps.map(step=>`${step.stepOrder}. ${escapeHtml(step.name)}(${escapeHtml(step.approverRole)})`).join('<br>')}</td><td>${policy.active?'활성':'비활성'}</td></tr>`).join('');
  const parentOptions=options(departments,row=>`${row.unit_type} · ${row.name}`);
  const referenceRows=(kind,items)=>items.map(row=>`<tr><td class="mono">${escapeHtml(row.code||row.brand||'-')}</td><td>${escapeHtml(row.category_name||row.location_type||'-')}</td><td><input class="reference-name" data-kind="${kind}" data-id="${row.id}" value="${escapeHtml(row.name)}" aria-label="${escapeHtml(row.name)} 명칭"></td><td><label class="inline-check"><input class="reference-active" data-kind="${kind}" data-id="${row.id}" type="checkbox" ${row.is_active?'checked':''}> 활성</label></td><td><button class="small reference-update" data-kind="${kind}" data-id="${row.id}">저장</button></td></tr>`).join('');
  const statusRows=refs.statuses.map(row=>`<tr><td class="mono">${escapeHtml(row.code)}</td><td><input class="reference-name" data-kind="statuses" data-id="${row.id}" value="${escapeHtml(row.name)}" aria-label="${escapeHtml(row.code)} 표시명"></td><td><input class="reference-sort" data-id="${row.id}" type="number" min="0" max="999" value="${row.sort_order}"></td><td><label class="inline-check"><input class="reference-active" data-kind="statuses" data-id="${row.id}" type="checkbox" ${row.is_active?'checked':''}> 활성</label></td><td><button class="small reference-update" data-kind="statuses" data-id="${row.id}">저장</button></td></tr>`).join('');
  const reasonRows=refs.reasons.map(row=>`<tr><td class="mono">${escapeHtml(row.code)}</td><td><input class="reference-name" data-kind="reasons" data-id="${row.id}" value="${escapeHtml(row.name)}" aria-label="${escapeHtml(row.code)} 사유명"></td><td>${escapeHtml(row.applies_to_status||'전체')}<br><small>${row.requires_detail?'추가 설명 필수':'추가 설명 선택'}</small></td><td><label class="inline-check"><input class="reference-active" data-kind="reasons" data-id="${row.id}" type="checkbox" ${row.is_active?'checked':''}> 활성</label></td><td><button class="small reference-update" data-kind="reasons" data-id="${row.id}">저장</button></td></tr>`).join('');
  const activeCategories=refs.categories.filter(row=>row.is_active); const activeLocations=refs.locations.filter(row=>row.is_active);
  $('#view-root').innerHTML=`<div class="page-heading"><div><p class="eyebrow">ORGANIZATION / ACCESS / OUTBOX</p><h1>시스템<br>관리 콘솔</h1><p class="muted">조직 계층·사용자 초대와 이벤트 발행 상태를 관리합니다.</p></div></div>
  <section class="two-column"><article class="panel form-panel"><div><h2>조직 단위 추가</h2><p class="muted">법인 아래 본부·부서·팀 계층을 구성합니다.</p></div><form id="unit-create" class="grid-form"><label>유형<select name="unitType"><option>HEADQUARTERS</option><option>DEPARTMENT</option><option>TEAM</option><option>CORPORATE</option></select></label><label>상위 조직<select name="parentId"><option value="">법인만 비움</option>${parentOptions}</select></label><label>코드<input name="code" required></label><label>이름<input name="name" required></label><label>비용센터<input name="costCenter"></label><label>관리자 비밀번호<input type="password" name="currentPassword" autocomplete="current-password" required></label><button class="primary full">조직 단위 생성</button></form></article>
  <article class="panel form-panel"><div><h2>사용자 초대</h2><p class="muted">초대 링크는 개발 환경에서 한 번만 표시됩니다.</p></div><form id="invite-create" class="grid-form"><label>이메일<input type="email" name="email" required></label><label>이름<input name="displayName" required></label><label>역할<select name="role"><option>USER</option><option>MANAGER</option></select></label><label>데이터 범위<select name="scopeType"><option>DEPARTMENT</option><option>ORGANIZATION</option></select></label><label>소속 조직<select name="departmentId"><option value="">조직 전체</option>${parentOptions}</select></label><label>관리자 비밀번호<input type="password" name="currentPassword" autocomplete="current-password" required></label><button class="primary full">초대 발급</button></form><p id="invite-result" class="mono details"></p></article></section>
  <section class="two-column"><article class="panel"><div class="panel-head"><h2>조직 계층</h2></div><div class="table-wrap"><table><thead><tr><th>유형</th><th>코드</th><th>이름</th><th>비용센터</th></tr></thead><tbody>${units}</tbody></table></div></article><article class="panel"><div class="panel-head"><h2>초대 현황</h2></div><div class="table-wrap"><table><thead><tr><th>사용자</th><th>역할</th><th>범위</th><th>상태</th></tr></thead><tbody>${invitations||'<tr><td colspan="4">초대가 없습니다.</td></tr>'}</tbody></table></div></article></section>
  <section class="panel form-panel"><div><p class="eyebrow">SEQUENTIAL APPROVAL POLICY</p><h2>다단계 승인 정책</h2><p class="muted">요청 유형과 구매 금액 구간에 따라 1~2단계 순차 승인을 설정합니다.</p></div><form id="approval-policy-create" class="grid-form enterprise-form"><label>정책명<input name="name" required minlength="2" maxlength="120"></label><label>요청 유형<select name="requestType"><option>PURCHASE</option><option>ASSIGN</option><option>RETURN</option><option>TRANSFER</option><option>REPAIR</option><option>LOST</option><option>DISPOSAL</option></select></label><label>최소 금액<input name="amountMin" type="number" min="0" step="0.01"></label><label>최대 금액<input name="amountMax" type="number" min="0" step="0.01"></label><label>1단계 역할<select name="step1Role"><option>MANAGER</option><option>ADMIN</option></select></label><label>2단계 역할<select name="step2Role"><option value="">없음</option><option>MANAGER</option><option>ADMIN</option></select></label><label>관리자 비밀번호<input type="password" name="currentPassword" autocomplete="current-password" required></label><button class="primary full">승인 정책 등록</button></form><div class="table-wrap"><table><thead><tr><th>유형</th><th>정책</th><th>금액 구간</th><th>단계</th><th>상태</th></tr></thead><tbody>${policyRows||'<tr><td colspan="5">정책이 없습니다.</td></tr>'}</tbody></table></div></section>
  <section class="panel reference-console"><div class="panel-head"><div><p class="eyebrow">REFERENCE DATA / LIFECYCLE</p><h2>기준정보 관리</h2><p class="muted">삭제하지 않고 비활성화해 기존 자산 이력을 보존합니다.</p></div><label>관리자 비밀번호<input id="reference-password" type="password" autocomplete="current-password" required></label></div><div class="reference-creators">
    <details><summary>자산 유형 추가</summary><form class="grid-form reference-create" data-kind="categories"><label>코드<input name="code" required></label><label>명칭<input name="name" required></label><label>상위 유형<select name="parentId"><option value="">없음</option>${options(activeCategories,row=>row.name)}</select></label><button class="primary">등록</button></form></details>
    <details><summary>모델 추가</summary><form class="grid-form reference-create" data-kind="models"><label>유형<select name="categoryId" required>${options(activeCategories,row=>row.name)}</select></label><label>브랜드<input name="brand" required></label><label>모델명<input name="name" required></label><label>사양 JSON<textarea name="specification" rows="2">{}</textarea></label><button class="primary">등록</button></form></details>
    <details><summary>공급업체 추가</summary><form class="grid-form reference-create" data-kind="vendors"><label>코드<input name="code" required></label><label>업체명<input name="name" required></label><label>담당 이메일<input type="email" name="contactEmail"></label><button class="primary">등록</button></form></details>
    <details><summary>위치 추가</summary><form class="grid-form reference-create" data-kind="locations"><label>코드<input name="code" required></label><label>위치명<input name="name" required></label><label>유형<select name="locationType"><option>SITE</option><option>OFFICE</option><option>WAREHOUSE</option><option>FLOOR</option><option>ROOM</option></select></label><label>상위 위치<select name="parentId"><option value="">없음</option>${options(activeLocations,row=>row.name)}</select></label><button class="primary">등록</button></form></details>
    <details><summary>상태 정책 추가</summary><form class="grid-form reference-create" data-kind="statuses"><label>고정 상태 코드<select name="code">${[...['DRAFT','RECEIVED','INSPECTION_PENDING','AVAILABLE','ASSIGNED','IN_USE','TRANSFER_PENDING','RETURNED','REPAIR','LOST','FOUND','DISPOSE_PENDING','DISPOSED','CANCELLED']].map(code=>`<option>${code}</option>`).join('')}</select></label><label>표시명<input name="name" required></label><label>설명<input name="description" maxlength="300"></label><label>정렬<input name="sortOrder" type="number" min="0" max="999" value="0"></label><button class="primary">등록</button></form></details>
    <details><summary>변경 사유 추가</summary><form class="grid-form reference-create" data-kind="reasons"><label>코드<input name="code" required></label><label>사유명<input name="name" required></label><label>적용 상태<select name="appliesToStatus"><option value="">전체</option>${refs.statuses.map(row=>`<option value="${escapeHtml(row.code)}">${escapeHtml(row.code)}</option>`).join('')}</select></label><label class="inline-check"><input name="requiresDetail" type="checkbox"> 추가 설명 필수</label><button class="primary">등록</button></form></details>
  </div><div class="reference-lists"><article><h3>자산 유형</h3><div class="table-wrap"><table><thead><tr><th>코드</th><th>분류</th><th>명칭</th><th>상태</th><th>처리</th></tr></thead><tbody>${referenceRows('categories',refs.categories)||'<tr><td colspan="5">등록된 유형이 없습니다.</td></tr>'}</tbody></table></div></article><article><h3>모델</h3><div class="table-wrap"><table><thead><tr><th>브랜드</th><th>유형</th><th>명칭</th><th>상태</th><th>처리</th></tr></thead><tbody>${referenceRows('models',refs.models)||'<tr><td colspan="5">등록된 모델이 없습니다.</td></tr>'}</tbody></table></div></article><article><h3>공급업체</h3><div class="table-wrap"><table><thead><tr><th>코드</th><th>구분</th><th>명칭</th><th>상태</th><th>처리</th></tr></thead><tbody>${referenceRows('vendors',refs.vendors)||'<tr><td colspan="5">등록된 공급업체가 없습니다.</td></tr>'}</tbody></table></div></article><article><h3>위치</h3><div class="table-wrap"><table><thead><tr><th>코드</th><th>유형</th><th>명칭</th><th>상태</th><th>처리</th></tr></thead><tbody>${referenceRows('locations',refs.locations)||'<tr><td colspan="5">등록된 위치가 없습니다.</td></tr>'}</tbody></table></div></article><article><h3>자산 상태 정책</h3><div class="table-wrap"><table><thead><tr><th>코드</th><th>표시명</th><th>정렬</th><th>상태</th><th>처리</th></tr></thead><tbody>${statusRows}</tbody></table></div></article><article><h3>상태 변경 사유</h3><div class="table-wrap"><table><thead><tr><th>코드</th><th>사유명</th><th>정책</th><th>상태</th><th>처리</th></tr></thead><tbody>${reasonRows}</tbody></table></div></article></div></section>
  <section class="two-column"><article class="panel"><div class="panel-head"><h2>사용자 접근</h2></div><div class="table-wrap"><table><thead><tr><th>이름</th><th>이메일</th><th>역할</th><th>데이터 범위</th><th>상태</th><th>MFA</th></tr></thead><tbody>${users}</tbody></table></div></article><article class="panel"><div class="panel-head"><h2>이벤트 Outbox</h2></div><div class="table-wrap"><table><thead><tr><th>일자</th><th>대상</th><th>이벤트</th><th>상태</th></tr></thead><tbody>${events||'<tr><td colspan="4">이벤트가 없습니다.</td></tr>'}</tbody></table></div></article></section>`;
  const submitAdmin=async(event,path)=>{event.preventDefault();const body=Object.fromEntries(new FormData(event.target));const currentPassword=body.currentPassword;delete body.currentPassword;body.organizationId=state.user.organizationId;await request('/api/auth/reauth',{method:'POST',body:{password:currentPassword}});return request(path,{method:'POST',body});};
  $('#unit-create').addEventListener('submit',async event=>{try{await submitAdmin(event,'/api/enterprise/admin/departments');showMessage('조직 단위를 생성했습니다.');renderAdmin();}catch(error){showMessage(error.message,'error');}});
  $('#invite-create').addEventListener('submit',async event=>{try{const result=await submitAdmin(event,'/api/enterprise/admin/invitations');if(result.developmentToken){const url=`${location.origin}/#invitation=${encodeURIComponent(result.developmentToken)}`;$('#invite-result').innerHTML=`초대 링크: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;}else{$('#invite-result').textContent='초대가 등록되었습니다. 운영 알림 발송기에 연결하세요.';}showMessage('사용자 초대를 발급했습니다.');}catch(error){showMessage(error.message,'error');}});
  $('#approval-policy-create').addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.target));const password=values.currentPassword;const steps=[{name:'1단계 승인',approverRole:values.step1Role,departmentScope:'REQUEST_DEPARTMENT'}];if(values.step2Role)steps.push({name:'2단계 승인',approverRole:values.step2Role,departmentScope:'REQUEST_DEPARTMENT'});const body={organizationId:state.user.organizationId,name:values.name,requestType:values.requestType,amountMin:values.amountMin,amountMax:values.amountMax,steps};try{await request('/api/auth/reauth',{method:'POST',body:{password}});await request('/api/enterprise/admin/approval-policies',{method:'POST',body});showMessage('승인 정책을 등록했습니다.');renderAdmin();}catch(error){showMessage(error.message,'error');}});
  const runLocked=async(button,operation)=>{button.disabled=true;try{return await operation();}finally{button.disabled=false;}};
  const reauthReference=async()=>{const password=$('#reference-password').value;if(!password)throw new Error('기준정보 변경 전에 관리자 비밀번호를 입력하세요.');await request('/api/auth/reauth',{method:'POST',body:{password}});};
  document.querySelectorAll('.reference-create').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;try{await runLocked(button,async()=>{await reauthReference();const body=Object.fromEntries(new FormData(form));if(form.dataset.kind==='reasons')body.requiresDetail=form.elements.requiresDetail.checked;body.organizationId=state.user.organizationId;await request(`/api/enterprise/admin/references/${form.dataset.kind}`,{method:'POST',body});});showMessage('기준정보를 등록했습니다.');renderAdmin();}catch(error){showMessage(error.message,'error');}}));
  document.querySelectorAll('.reference-update').forEach(button=>button.addEventListener('click',async()=>{const kind=button.dataset.kind;const id=button.dataset.id;const row=refs[kind].find(item=>String(item.id)===id);const nameInput=document.querySelector(`.reference-name[data-kind="${kind}"][data-id="${id}"]`);const activeInput=document.querySelector(`.reference-active[data-kind="${kind}"][data-id="${id}"]`);const body={organizationId:state.user.organizationId,name:nameInput.value,isActive:activeInput.checked};if(kind==='statuses'){body.description=row.description||'';body.sortOrder=Number(document.querySelector(`.reference-sort[data-id="${id}"]`).value);}if(kind==='reasons'){body.appliesToStatus=row.applies_to_status||'';body.requiresDetail=row.requires_detail;}try{await runLocked(button,async()=>{await reauthReference();await request(`/api/enterprise/admin/references/${kind}/${id}`,{method:'PATCH',body});});showMessage('기준정보를 저장했습니다.');renderAdmin();}catch(error){showMessage(error.message,'error');}}));
}

async function renderAudit(filters = {}) {
  const query = new URLSearchParams(Object.entries(filters).filter(([,value])=>value)).toString();
  const [data,ref] = await Promise.all([request(`/api/audit${query?`?${query}`:''}`),reference()]);
  const rows = data.logs.map(log => `<tr><td>${new Date(log.created_at).toLocaleString('ko-KR')}</td><td>${escapeHtml(log.display_name || '시스템')}</td><td><span class="badge neutral">${escapeHtml(log.action)}</span></td><td>${escapeHtml(log.entity_type)} ${escapeHtml(log.entity_id || '')}</td><td class="mono details">${escapeHtml(log.request_id || '-')}<br>${escapeHtml(log.ip_address || '-')}</td><td class="mono details">${escapeHtml(JSON.stringify(log.metadata))}</td></tr>`).join('');
  $('#view-root').innerHTML = `<div class="page-heading"><div><p class="eyebrow">TRACE / GOVERNANCE / SEARCH</p><h1>변경<br>원장</h1><p class="muted">핵심 행위와 변경 전·후 값을 작업자·기간·검색어로 추적합니다.</p></div></div><section class="panel form-panel"><div><h2>감사 검색</h2><p class="muted">메타데이터 검색은 변경 전·후 값에도 적용됩니다.</p></div><form id="audit-filter" class="grid-form enterprise-form"><label>행위<input name="action" value="${escapeHtml(filters.action||'')}" placeholder="ASSET_CREATED"></label><label>대상 유형<input name="entityType" value="${escapeHtml(filters.entityType||'')}" placeholder="ASSET"></label><label>작업자<select name="actorId"><option value="">전체</option>${options(ref.users,row=>`${row.display_name} · ${row.email}`,filters.actorId)}</select></label><label>시작 시각<input type="datetime-local" name="from" value="${escapeHtml(filters.from||'')}"></label><label>종료 시각<input type="datetime-local" name="to" value="${escapeHtml(filters.to||'')}"></label><label>변경값·요청ID 검색<input name="q" maxlength="100" value="${escapeHtml(filters.q||'')}"></label><button class="primary full">감사 로그 검색</button></form></section><section class="panel audit-ledger"><div class="panel-head"><h2>AUDIT TRAIL</h2><span class="mono">${data.logs.length} EVENTS</span></div><div class="table-wrap"><table><thead><tr><th>시각</th><th>작업자</th><th>작업</th><th>대상</th><th>요청 추적</th><th>세부정보</th></tr></thead><tbody>${rows||'<tr><td colspan="6">검색 결과가 없습니다.</td></tr>'}</tbody></table></div></section>`;
  $('#audit-filter').addEventListener('submit',event=>{event.preventDefault();renderAudit(Object.fromEntries(new FormData(event.target)));});
}

async function renderSecurity() {
  const enabled = Boolean(state.user.mfaEnabled);
  $('#view-root').innerHTML = `<div class="page-heading"><div><p class="eyebrow">ACCOUNT SECURITY</p><h1>보안<br>설정</h1><p class="muted">비밀번호 외에 인증 앱 코드를 추가해 계정을 보호합니다.</p></div></div>
  <section class="panel form-panel"><div><h2>TOTP MFA</h2><p class="muted">현재 상태: <span id="mfa-status">${enabled ? '사용 중' : '미사용'}</span></p></div>
  ${enabled ? `<form id="mfa-disable" class="grid-form"><label>현재 비밀번호<input type="password" name="password" autocomplete="current-password" required></label><label>인증 또는 복구코드<input name="code" autocomplete="one-time-code" required></label><button class="danger-button">MFA 해제</button></form>` : `<form id="mfa-setup" class="grid-form"><label>현재 비밀번호<input type="password" name="password" autocomplete="current-password" required></label><button class="primary">MFA 등록 시작</button></form><div id="mfa-setup-result" class="details"></div>`}
  </section>`;
  $('#mfa-setup')?.addEventListener('submit', async event => { event.preventDefault(); const button=event.submitter; button.disabled=true; try { const password=new FormData(event.target).get('password'); await request('/api/auth/reauth',{method:'POST',body:{password}}); const setup=await request('/api/auth/mfa/setup',{method:'POST',body:{}}); $('#mfa-setup-result').innerHTML=`<p>인증 앱에 아래 비밀키를 등록한 뒤 현재 코드를 입력하세요.</p><p class="mono">${escapeHtml(setup.secret)}</p><form id="mfa-enable" class="grid-form"><label>6자리 코드<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required></label><button class="primary">MFA 활성화</button></form>`; $('#mfa-enable').addEventListener('submit',enableMfaFromForm); } catch(error){showMessage(error.message,'error');} finally {button.disabled=false;} });
  $('#mfa-disable')?.addEventListener('submit', async event => { event.preventDefault(); const values=Object.fromEntries(new FormData(event.target)); try { await request('/api/auth/reauth',{method:'POST',body:{password:values.password}}); await request('/api/auth/mfa/disable',{method:'POST',body:{code:values.code}}); state.user.mfaEnabled=false; showMessage('MFA를 해제했습니다.'); renderSecurity(); } catch(error){showMessage(error.message,'error');} });
}

async function enableMfaFromForm(event) {
  event.preventDefault(); const button=event.submitter; button.disabled=true;
  try { const result=await request('/api/auth/mfa/enable',{method:'POST',body:{code:new FormData(event.target).get('code')}}); state.user.mfaEnabled=true; $('#mfa-status').textContent='사용 중'; $('#mfa-setup-result').innerHTML=`<div class="alert success"><strong>복구코드는 지금 한 번만 표시됩니다.</strong><p class="mono">${result.recoveryCodes.map(escapeHtml).join('<br>')}</p></div>`; showMessage('MFA를 활성화했습니다.'); }
  catch(error){showMessage(error.message,'error');} finally {button.disabled=false;}
}

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const errorBox = $('#login-error');
  errorBox.classList.add('hidden');
  try {
    const data = await request('/api/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(event.target)) });
    if (data.mfaRequired) { state.csrfToken=data.csrfToken; event.target.reset(); event.target.classList.add('hidden'); $('#mfa-login-form').classList.remove('hidden'); return; }
    state.user = data.user;
    state.csrfToken = data.csrfToken;
    event.target.reset();
    showApp();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('hidden');
  }
});

$('#mfa-login-form').addEventListener('submit', async event => {
  event.preventDefault(); const errorBox=$('#mfa-login-error'); errorBox.classList.add('hidden');
  try { const data=await request('/api/auth/mfa/verify',{method:'POST',body:{code:new FormData(event.target).get('code')}}); state.user=data.user; state.csrfToken=data.csrfToken; event.target.reset(); showApp(); }
  catch(error){errorBox.textContent=error.message;errorBox.classList.remove('hidden');}
});
$('#mfa-login-back').addEventListener('click',async()=>{const csrf=await request('/api/auth/csrf');state.csrfToken=csrf.csrfToken;$('#mfa-login-form').classList.add('hidden');$('#login-form').classList.remove('hidden');});

$('#invitation-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values=Object.fromEntries(new FormData(event.target));
  const errorBox=$('#invitation-error'); errorBox.classList.add('hidden');
  if(values.newPassword!==values.passwordConfirm){errorBox.textContent='비밀번호 확인이 일치하지 않습니다.';return errorBox.classList.remove('hidden');}
  try{await request('/api/auth/invitations/accept',{method:'POST',body:{token:values.token,newPassword:values.newPassword}});history.replaceState({},'',location.pathname);event.target.reset();$('#invitation-form').classList.add('hidden');$('#login-form').classList.remove('hidden');showMessage('계정을 활성화했습니다. 로그인하세요.');}
  catch(error){errorBox.textContent=error.message;errorBox.classList.remove('hidden');}
});
$('#invitation-back').addEventListener('click',()=>{history.replaceState({},'',location.pathname);$('#invitation-form').classList.add('hidden');$('#login-form').classList.remove('hidden');});

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
document.addEventListener('click', event => { const target = event.target.closest('[data-go]'); if (target) navigate(target.dataset.go); });
$('#logout-button').addEventListener('click', async () => { try { await request('/api/auth/logout', { method:'POST', body:{} }); } finally { const csrf = await request('/api/auth/csrf'); state.csrfToken = csrf.csrfToken; showLogin(); } });

boot();
