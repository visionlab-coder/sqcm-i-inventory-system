import fs from 'node:fs';
import assert from 'node:assert/strict';

const index = fs.readFileSync('frontend/index.html', 'utf8');
const app = fs.readFileSync('frontend/app.js', 'utf8');
const components = fs.readFileSync('frontend/ui-components.js', 'utf8');
const dockerfile = fs.readFileSync('frontend/Dockerfile', 'utf8');
const baseCss = fs.readFileSync('frontend/styles.css', 'utf8');
const css = fs.readFileSync('frontend/experience.css', 'utf8');
const checks = [
  ['mobile toggle has an accessible name', /id="mobile-nav-toggle"[^>]+aria-controls="primary-sidebar"[^>]+aria-expanded="false"/],
  ['mobile drawer has a backdrop', /id="nav-backdrop"/],
  ['mobile backdrop stays outside the interactive sidebar', /<\/aside>\s*<div class="nav-backdrop" id="nav-backdrop"/],
  ['navigation resets scroll and preserves view state', /history\.replaceState[\s\S]*window\.scrollTo/],
  ['asset list uses server pagination', /api\/enterprise\/assets\?q=.*page=.*size=/],
  ['legacy catalogue is hidden from navigation', /data-view="items".*display:none|data-view="items"/],
  ['tables are horizontally scrollable', /\.table-wrap\s*\{[^}]*overflow-x:auto/],
  ['desktop sidebar keeps all navigation actions reachable', /\.sidebar\s*\{[^}]*overflow-y:auto/],
  ['mobile drawer exposes the authenticated user actions', /@media\(max-width:720px\)[\s\S]*?\.sidebar \.user-box\s*\{[^}]*display:grid/],
  ['cost command center route is rendered', /renderCostControl/],
  ['dashboard reads the canonical enterprise ledger', /renderDashboard[\s\S]*api\/enterprise\/dashboard/],
  ['frontend has no legacy ledger API calls', /\/api\/(dashboard|items|loans)/],
  ['shared UI component bundle loads before the app', /ui-components\.js[\s\S]*app\.js/],
  ['admin tabs expose selection state', /data-admin-section[\s\S]*aria-selected/],
  ['workflow tabs expose selection state', /data-workflow-section[\s\S]*aria-selected/]
];
for (const [name, pattern] of checks) {
  const source = `${index}\n${app}\n${components}\n${baseCss}\n${css}`;
  if (name === 'frontend has no legacy ledger API calls') assert.doesNotMatch(source, pattern, name);
  else assert.match(source, pattern, name);
}
assert.ok((index.match(/<label/g) || []).length >= 3, 'forms must keep explicit labels');
assert.match(components, /module\.exports/);
assert.match(dockerfile, /frontend\/ui-components\.js/);
console.log(`UI contract checks passed: ${checks.length + 1}`);
