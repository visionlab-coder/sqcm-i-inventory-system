import fs from 'node:fs';
import assert from 'node:assert/strict';

const index = fs.readFileSync('frontend/index.html', 'utf8');
const app = fs.readFileSync('frontend/app.js', 'utf8');
const components = fs.readFileSync('frontend/ui-components.js', 'utf8');
const dockerfile = fs.readFileSync('frontend/Dockerfile', 'utf8');
const baseCss = fs.readFileSync('frontend/styles.css', 'utf8');
const css = fs.readFileSync('frontend/experience.css', 'utf8');
const consentHtml = fs.readFileSync('frontend/oauth-consent.html', 'utf8');
const consentJs = fs.readFileSync('frontend/oauth-consent-entry.js', 'utf8');
const stagingNginx = fs.readFileSync('frontend/nginx.staging.conf', 'utf8');
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
  ,['first login requires an isolated password-change form', /id="required-password-change-form"[\s\S]*autocomplete="current-password"[\s\S]*autocomplete="new-password"/]
  ,['password-reset-required user is routed before the app shell', /function showApp\(\)[\s\S]*passwordResetRequired[\s\S]*showRequiredPasswordChange/]
  ,['password-change-required API responses route to the isolated form', /data\.code === 'PASSWORD_CHANGE_REQUIRED'[\s\S]*showRequiredPasswordChange\(\)/]
];
for (const [name, pattern] of checks) {
  const source = `${index}\n${app}\n${components}\n${baseCss}\n${css}`;
  if (name === 'frontend has no legacy ledger API calls') assert.doesNotMatch(source, pattern, name);
  else assert.match(source, pattern, name);
}
assert.ok((index.match(/<label/g) || []).length >= 3, 'forms must keep explicit labels');
assert.match(components, /module\.exports/);
assert.match(dockerfile, /frontend\/ui-components\.js/);
assert.match(consentHtml, /autocomplete="username"[\s\S]*autocomplete="current-password"/, 'consent login keeps safe autocomplete semantics');
assert.match(consentHtml, /role="status"[\s\S]*role="alert"/, 'consent states are announced accessibly');
assert.match(consentJs, /persistSession:false[\s\S]*autoRefreshToken:false/, 'consent session is memory-only');
assert.match(consentJs, /getAuthorizationDetails[\s\S]*approveAuthorization[\s\S]*denyAuthorization/, 'consent implements the Supabase OAuth decision flow');
assert.match(consentJs, /skipBrowserRedirect\s*:\s*true/, 'consent owns one explicit OAuth redirect path');
assert.match(stagingNginx, /proxy_set_header\s+X-Forwarded-Proto\s+https;/, 'staging tunnel preserves the public HTTPS scheme for secure cookies');
console.log(`UI contract checks passed: ${checks.length + 5}`);
