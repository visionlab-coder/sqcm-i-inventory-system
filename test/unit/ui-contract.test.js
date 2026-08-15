const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('프런트엔드는 모바일 내비게이션·비용 화면 계약을 갖는다', () => {
  const index=fs.readFileSync('frontend/index.html','utf8'); const app=fs.readFileSync('frontend/app.js','utf8'); const components=fs.readFileSync('frontend/ui-components.js','utf8'); const css=fs.readFileSync('frontend/experience.css','utf8'); const dockerfile=fs.readFileSync('frontend/Dockerfile','utf8');
  assert.match(index,/mobile-nav-toggle/); assert.match(index,/aria-controls="primary-sidebar"/); assert.match(app,/renderCostControl/); assert.match(app,/window\.scrollTo/); assert.match(app,/api\/enterprise\/dashboard/); assert.doesNotMatch(app,/\/api\/(dashboard|items|loans)/); assert.match(app,/data-admin-section/); assert.match(app,/data-workflow-section/); assert.match(components,/statusBadge/); assert.match(css,/overflow-x:auto/); assert.match(dockerfile,/frontend\/ui-components\.js/);
});
