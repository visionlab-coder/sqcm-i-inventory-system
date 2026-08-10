const test = require('node:test');
const assert = require('node:assert/strict');
const { getConfig } = require('../../src/config');

const baseUrl = process.env.INTEGRATION_BASE_URL;
const config = getConfig();
const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0];

async function login(email, password) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`); const csrfToken = (await csrfResponse.json()).csrfToken; const anonymousCookie = cookieFrom(csrfResponse);
  const response = await fetch(`${baseUrl}/api/auth/login`, { method:'POST', headers:{cookie:anonymousCookie,'content-type':'application/json'}, body:JSON.stringify({ _csrf:csrfToken,email,password }) });
  assert.equal(response.status,200); const data=await response.json(); return { cookie:cookieFrom(response),csrfToken:data.csrfToken,user:data.user };
}
const get = (path, session) => fetch(`${baseUrl}${path}`, { headers:{cookie:session.cookie,accept:'application/json'} });

test('역할별 현장 UAT API 계약은 자산·Cost·관리자 범위를 분리한다', { skip: !baseUrl }, async () => {
  const user=await login('employee@seowon.local',config.seedUserPassword); const manager=await login('manager@seowon.local',config.seedManagerPassword); const admin=await login('admin@seowon.local',config.seedAdminPassword);
  const userDashboard=await get(`/api/enterprise/dashboard?organizationId=${user.user.organizationId}`,user); assert.equal(userDashboard.status,200);
  const userCost=await get(`/api/enterprise/cost/roi?organizationId=${user.user.organizationId}`,user); assert.equal(userCost.status,403);
  const managerCost=await get(`/api/enterprise/cost/roi?organizationId=${manager.user.organizationId}`,manager); assert.equal(managerCost.status,200);
  const managerAdmin=await get(`/api/enterprise/admin?organizationId=${manager.user.organizationId}`,manager); assert.equal(managerAdmin.status,403);
  const adminConsole=await get(`/api/enterprise/admin?organizationId=${admin.user.organizationId}`,admin); assert.equal(adminConsole.status,200);
});
