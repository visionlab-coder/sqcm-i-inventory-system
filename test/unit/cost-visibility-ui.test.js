const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../../frontend/app.js'),'utf8');
const start = source.indexOf('async function renderCostControl() {');
const end = source.indexOf('\n}',start)+2;
async function render(roi) {
  const root = {innerHTML:''};
  const context = vm.createContext({
    state:{user:{organizationId:1}},
    request: async url => url.includes('/roi?') ? roi : {},
    $: selector => selector==='#view-root' ? root : null,
    isManager:()=>false, escapeHtml:String, date:String
  });
  await vm.runInContext(source.slice(start,end)+'\nrenderCostControl()',context);
  return root.innerHTML;
}
test('ROI UI distinguishes restricted organization aggregates from empty data',async()=>{
  const html=await render({visibility:{organizationAggregatesRestricted:true},vendors:[],budgets:[]});
  assert.match(html,/부서 조회 권한에서는 조직 전체 예산·공급사 집계를 표시하지 않습니다/);
  assert.doesNotMatch(html,/공급사 거래가 없습니다|올해 예산이 없습니다/);
});
test('ROI UI retains empty-data wording for unrestricted empty aggregates',async()=>{
  const html=await render({visibility:{organizationAggregatesRestricted:false},vendors:[],budgets:[]});
  assert.match(html,/공급사 거래가 없습니다/); assert.match(html,/올해 예산이 없습니다/);
});
test('ROI UI distinguishes unavailable aggregates from empty data',async()=>{
  const html=await render(null);
  assert.match(html,/비용 집계를 불러오지 못했습니다/);
  assert.doesNotMatch(html,/공급사 거래가 없습니다|올해 예산이 없습니다/);
});
