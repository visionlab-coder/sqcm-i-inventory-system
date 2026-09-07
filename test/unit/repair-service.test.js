const test = require('node:test');
const assert = require('node:assert/strict');
const { repairCost } = require('../../src/services/repair-service');
test('repair cost distinguishes omission from explicit zero',()=>{
  assert.equal(repairCost(undefined),undefined); assert.equal(repairCost(0),0); assert.equal(repairCost('123.45'),123.45);
});
test('repair cost rejects ambiguous or lossy amounts',()=>{
  for (const value of [null,'',true,-1,'NaN',Infinity,'1.234','1e3']) assert.throws(()=>repairCost(value),e=>e.status===400);
});
