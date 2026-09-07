const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('R4 quality allows only the approved branch without enabling release deployment',()=>{
  const quality=fs.readFileSync(path.join(__dirname,'../../.github/workflows/quality.yml'),'utf8');
  const release=fs.readFileSync(path.join(__dirname,'../../.github/workflows/release-images.yml'),'utf8');
  assert.match(quality,/branches: \[main, codex\/p7-qs-6-16-0-production-evidence\]/);
  assert.match(quality,/contents: read/);
  assert.doesNotMatch(quality,/self-hosted|secrets\.|contents: write|packages: write/);
  assert.match(release,/branches: \[main\]/);
  assert.doesNotMatch(release,/codex\/p7-qs-6-16-0-production-evidence/);
});
