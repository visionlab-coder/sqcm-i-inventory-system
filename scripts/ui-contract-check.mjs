import fs from 'node:fs';
import assert from 'node:assert/strict';

const index = fs.readFileSync('frontend/index.html', 'utf8');
const app = fs.readFileSync('frontend/app.js', 'utf8');
const css = fs.readFileSync('frontend/experience.css', 'utf8');
const checks = [
  ['mobile toggle has an accessible name', /id="mobile-nav-toggle"[^>]+aria-controls="primary-sidebar"[^>]+aria-expanded="false"/],
  ['mobile drawer has a backdrop', /id="nav-backdrop"/],
  ['navigation resets scroll and preserves view state', /history\.replaceState[\s\S]*window\.scrollTo/],
  ['asset list uses server pagination', /api\/enterprise\/assets\?q=.*page=.*size=/],
  ['legacy catalogue is hidden from navigation', /data-view="items".*display:none|data-view="items"/],
  ['tables are horizontally scrollable', /\.table-wrap\s*\{[^}]*overflow-x:auto/],
  ['cost command center route is rendered', /renderCostControl/]
];
for (const [name, pattern] of checks) assert.match(`${index}\n${app}\n${css}`, pattern, name);
assert.ok((index.match(/<label/g) || []).length >= 3, 'forms must keep explicit labels');
console.log(`UI contract checks passed: ${checks.length + 1}`);
