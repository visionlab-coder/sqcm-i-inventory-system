const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const offline = fs.readFileSync('frontend/offline-stocktake.js', 'utf8');
const worker = fs.readFileSync('frontend/sw.js', 'utf8');
const manifest = JSON.parse(fs.readFileSync('frontend/manifest.webmanifest', 'utf8'));
const app = fs.readFileSync('frontend/app.js', 'utf8');

test('오프라인 저장소는 조사별 snapshot과 operation queue를 분리한다', () => {
  assert.match(offline, /createObjectStore\(SNAPSHOTS/);
  assert.match(offline, /createObjectStore\(OPERATIONS/);
  assert.match(offline, /createIndex\('stocktakeId'/);
  assert.match(offline, /existing\.filter[\s\S]*assetId[\s\S]*store\.delete/);
});

test('service worker는 인증 API를 캐시하지 않는다', () => {
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /event\.request\.method !== 'GET'/);
  assert.doesNotMatch(worker, /cache\.put[\s\S]*\/api\//);
});

test('PWA manifest와 화면은 오프라인·충돌 상태를 사용자에게 드러낸다', () => {
  assert.equal(manifest.lang, 'ko-KR');
  assert.equal(manifest.display, 'standalone');
  assert.match(app, /오프라인 저장본 사용 중/);
  assert.match(app, /직접 확인이 필요한 충돌/);
  assert.match(app, /대기 결과를 모두 동기화한 뒤 확정/);
});
