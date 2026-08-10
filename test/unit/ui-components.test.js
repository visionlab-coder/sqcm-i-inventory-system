const test = require('node:test');
const assert = require('node:assert/strict');
const UI = require('../../frontend/ui-components.js');

test('공통 UI 컴포넌트는 HTML을 escape하고 상태·탭 접근성 속성을 제공한다', () => {
  assert.equal(UI.escapeHtml('<script>'), '&lt;script&gt;');
  assert.match(UI.statusBadge('AVAILABLE'), /class="badge good"/);
  assert.match(UI.sectionTab('approval', '승인 큐', true), /aria-selected="true"/);
});
