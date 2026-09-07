const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('frontend image includes every local script loaded by the main SPA', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');
  const dockerfile = fs.readFileSync('frontend/Dockerfile', 'utf8');
  const copies = dockerfile.split(/\r?\n/).filter(line => line.startsWith('COPY frontend/')).join(' ').split(/\s+/);
  for (const match of html.matchAll(/<script[^>]+src="([^"?]+)(?:\?[^" ]*)?"/g)) {
    const source = match[1].replace(/^\//, '');
    assert.ok(!source.includes('://'), 'main SPA scripts must be local');
    assert.ok(copies.includes(`frontend/${source}`), `image COPY missing ${source}`);
  }
});
