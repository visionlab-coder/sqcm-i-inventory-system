(function attachAssetUi(root, factory) {
  const api = factory();
  if (root) root.AssetUI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  const date = value => value ? new Date(value).toLocaleDateString('ko-KR') : '-';
  const statusBadge = value => `<span class="badge ${['AVAILABLE','APPROVED','MATCH','ACTIVE','RESOLVED'].includes(value) ? 'good' : ['LOST','REJECTED','MISSING','DAMAGED'].includes(value) ? 'bad' : 'neutral'}">${escapeHtml(value)}</span>`;
  const sectionTab = (key, label, active) => `<button type="button" class="${active ? 'active' : ''}" data-section="${escapeHtml(key)}" aria-selected="${active}">${escapeHtml(label)}</button>`;
  return Object.freeze({ escapeHtml, date, statusBadge, sectionTab });
});
