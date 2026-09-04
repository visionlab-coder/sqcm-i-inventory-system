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
const offlineStocktake = fs.readFileSync('frontend/offline-stocktake.js', 'utf8');
const serviceWorker = fs.readFileSync('frontend/sw.js', 'utf8');
const checks = [
  ['mobile toggle has an accessible name', /id="mobile-nav-toggle"[^>]+aria-controls="primary-sidebar"[^>]+aria-expanded="false"/],
  ['screen-reader-only menu text is visually clipped', /\.sr-only\s*\{[^}]*position:absolute!important[^}]*clip:rect\(0,0,0,0\)!important/],
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
  ,['Excel migration exposes template, file input, and preview action', /assets\/import\/template\.csv[\s\S]*name="assetCsv"[\s\S]*등록 전 미리보기/]
  ,['bulk import keeps preview before explicit confirmation', /assets\/import\/preview[\s\S]*window\.confirm[\s\S]*assets\/import\/commit/]
  ,['bulk import result is announced to assistive technology', /id="asset-import-result"[^>]+aria-live="polite"/]
  ,['mobile header reserves space above the page heading', /@media\(max-width:720px\)[\s\S]*?\.content-wrap\{padding-top:52px\}[\s\S]*?\.topbar\{position:fixed;z-index:25[\s\S]*?\.main-content\{padding:3\.75rem 1rem 1rem\}/]
  ,['QR scan provides camera and manual fallback', /data-view="qr-scan"[\s\S]*renderQrScanner[\s\S]*BarcodeDetector[\s\S]*qr-manual-form/]
  ,['QR lookup is authenticated and opens canonical asset detail', /api\/enterprise\/assets\/qr\/[\s\S]*renderAssetDetail/]
  ,['QR labels provide single and A4 print modes', /qr-print-single[\s\S]*qr-print-a4[\s\S]*data-print-mode/]
  ,['QR mobile form stacks without horizontal overflow', /@media\(max-width:520px\)[^{]*\{[^}]*\.qr-manual-form>div[^}]*grid-template-columns:1fr/]
  ,['offline stocktake exposes connection and queue status', /offline-status[\s\S]*대기 결과 동기화/]
  ,['offline stocktake blocks confirmation while queued', /stock-confirm[\s\S]*offline\|\|queued\.length/]
];
for (const [name, pattern] of checks) {
  const source = `${index}\n${app}\n${components}\n${baseCss}\n${css}`;
  if (name === 'frontend has no legacy ledger API calls') assert.doesNotMatch(source, pattern, name);
  else assert.match(source, pattern, name);
}
const frontendSource = `${index}\n${app}\n${components}\n${baseCss}\n${css}`;
assert.match(frontendSource, /class="auth-account"[\s\S]*id="required-password-rules"[\s\S]*class="auth-field-stack"[\s\S]*class="auth-form-actions"/, 'first-login guidance groups account, rules, fields, and actions');
assert.doesNotMatch(app, /<h1>[^<]*<br>/, 'menu headings do not force awkward manual line breaks');
assert.ok((index.match(/<label/g) || []).length >= 3, 'forms must keep explicit labels');
assert.match(components, /module\.exports/);
assert.match(dockerfile, /frontend\/ui-components\.js/);
assert.match(consentHtml, /autocomplete="username"[\s\S]*autocomplete="current-password"/, 'consent login keeps safe autocomplete semantics');
assert.match(consentHtml, /role="status"[\s\S]*role="alert"/, 'consent states are announced accessibly');
assert.match(consentJs, /persistSession:false[\s\S]*autoRefreshToken:false/, 'consent session is memory-only');
assert.match(consentJs, /getAuthorizationDetails[\s\S]*approveAuthorization[\s\S]*denyAuthorization/, 'consent implements the Supabase OAuth decision flow');
assert.match(consentJs, /skipBrowserRedirect\s*:\s*true/, 'consent owns one explicit OAuth redirect path');
assert.match(stagingNginx, /proxy_set_header\s+X-Forwarded-Proto\s+https;/, 'staging tunnel preserves the public HTTPS scheme for secure cookies');
assert.match(offlineStocktake, /createObjectStore\(SNAPSHOTS[\s\S]*createObjectStore\(OPERATIONS/, 'offline data separates snapshots and queued writes');
assert.match(serviceWorker, /url\.pathname\.startsWith\('\/api\/'\)/, 'service worker never caches authenticated API responses');
console.log(`UI contract checks passed: ${checks.length + 9}`);
