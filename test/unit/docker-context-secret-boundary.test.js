const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('Docker context excludes root and nested environment files',()=>{
  const rules=fs.readFileSync(path.join(__dirname,'../../.dockerignore'),'utf8').split(/\r?\n/).map(s=>s.trim());
  for(const rule of ['.env','.env.*','**/.env','**/.env.*']) assert.ok(rules.includes(rule),`Missing ${rule}`);
  assert.ok(!rules.some(rule=>rule.startsWith('!')&&rule.includes('.env')),'No environment-file reinclude');
});
