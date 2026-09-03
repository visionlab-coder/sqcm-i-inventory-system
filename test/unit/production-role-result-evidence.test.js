const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/production-role-result-evidence.mjs');

const runId = '44444444-4444-4444-8444-444444444444';
const sha = 'b'.repeat(64);
const checkedAt = '2026-09-03T02:00:00.000Z';
const pass = {
  ADMIN: { passwordStatus:202,mfaRequired:true,invalidMfaStatus:401,mfaStatus:200,actualRole:'ADMIN',dashboard:200,cost:200,admin:200,logoutStatus:204 },
  MANAGER: { passwordStatus:202,mfaRequired:true,invalidMfaStatus:401,mfaStatus:200,actualRole:'MANAGER',dashboard:200,cost:200,admin:403,logoutStatus:204 },
  USER: { passwordStatus:202,mfaRequired:true,invalidMfaStatus:401,mfaStatus:200,actualRole:'USER',dashboard:200,cost:403,admin:403,logoutStatus:204 }
};

function input() {
  const fileName = 'role-core-smoke.json';
  return {
    runId, releaseSha: 'a'.repeat(40),
    roleStepDocument: { fileName, sha256: sha, value: { schemaVersion: 1, runId, checkedAt, kind: 'step', gate: 'core_smoke', step: 'role-core-smoke', status: 'PASS_PRODUCTION_ROLE_CORE_SMOKE', exitCode: 0, summary: { evidenceType: 'P6_ROLE_CORE_SMOKE_SUMMARY', targetKind: 'production-https', actualRoleCoreSmoke: 'PASS', anonymousItems: 401, roles: JSON.parse(JSON.stringify(pass)) } } },
    coreGateDocument: { fileName: 'core-smoke-summary.json', sha256: 'c'.repeat(64), value: { schemaVersion: 1, runId, checkedAt, kind: 'gate', gate: 'core_smoke', step: 'summary', status: 'PASS', evidenceRefs: [fileName] } }
  };
}

test('actual Production 역할 summary에서 세 역할 결과 문서를 컴파일한다', async () => {
  const { compileProductionRoleResultEvidence } = await modulePromise;
  const result = compileProductionRoleResultEvidence(input());
  assert.equal(result.status, 'PASS_PRODUCTION_ROLE_RESULT_EVIDENCE');
  assert.deepEqual(Object.keys(result.documents), ['ADMIN', 'MANAGER', 'USER']);
  assert.ok(Object.values(result.documents).every((document) => document.template === false && document.actualProduction === true));
  assert.equal(new Set(Object.values(result.documents).map((document) => document.resultSetPublicationId)).size, 1);
  assert.match(result.documents.ADMIN.resultSetPublicationId, /^[a-f0-9]{64}$/);
  assert.equal(result.productionGo, false);
});

test('loopback summary와 Gate 연결 누락은 actual 결과로 승격하지 않는다', async () => {
  const { compileProductionRoleResultEvidence } = await modulePromise;
  const value = input();
  value.roleStepDocument.value.summary.targetKind = 'loopback';
  value.coreGateDocument.value.evidenceRefs = [];
  const result = compileProductionRoleResultEvidence(value);
  assert.match(result.failures.join(','), /NOT_ACTUAL_PRODUCTION|GATE_RECEIPT_INVALID/);
});

test('MFA·RBAC 역조건이 하나라도 다르면 역할 결과를 만들지 않는다', async () => {
  const { compileProductionRoleResultEvidence } = await modulePromise;
  const value = input();
  value.roleStepDocument.value.summary.roles.MANAGER.admin = 200;
  const result = compileProductionRoleResultEvidence(value);
  assert.ok(result.failures.includes('ROLE_SMOKE_MANAGER_ADMIN_EXPECTED_403'));
});

test('세 역할 결과는 저장소 밖에 create-only로 작성하고 덮어쓰지 않는다', async () => {
  const { compileProductionRoleResultEvidence, writeProductionRoleResultEvidence } = await modulePromise;
  const result = compileProductionRoleResultEvidence(input());
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-role-results-'));
  const outputs = Object.fromEntries(['ADMIN', 'MANAGER', 'USER'].map((role) => [role, path.join(root, `${role}.json`)]));
  try {
    writeProductionRoleResultEvidence(outputs, result.documents, { repositoryRoot: path.join(root, 'different-repo') });
    assert.equal(fs.readdirSync(root).length, 3);
    assert.throws(() => writeProductionRoleResultEvidence(outputs, result.documents, { repositoryRoot: path.join(root, 'different-repo') }), /ALREADY_EXISTS/);
    assert.equal(fs.readdirSync(root).filter((name) => name.includes('.tmp-')).length, 0);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('사전 확인 가능한 후속 역할 출력 충돌은 어떤 결과도 게시하지 않는다', async (t) => {
  const { compileProductionRoleResultEvidence, writeProductionRoleResultEvidence } = await modulePromise;
  const result = compileProductionRoleResultEvidence(input());
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-role-results-existing-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputs = Object.fromEntries(['ADMIN', 'MANAGER', 'USER'].map((role) => [role, path.join(root, `${role}.json`)]));
  fs.writeFileSync(outputs.MANAGER, '{"owner":"existing"}\n', { flag: 'wx' });
  assert.throws(
    () => writeProductionRoleResultEvidence(outputs, result.documents, {
      repositoryRoot: path.join(root, 'different-repo')
    }),
    /ROLE_RESULT_OUTPUT_ALREADY_EXISTS/
  );
  assert.equal(fs.existsSync(outputs.ADMIN), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputs.MANAGER, 'utf8')), { owner: 'existing' });
  assert.equal(fs.existsSync(outputs.USER), false);
});

test('두 번째 역할 출력 경쟁 시 기존 증거를 삭제하지 않고 partial commit으로 중단한다', async (t) => {
  const { compileProductionRoleResultEvidence, writeProductionRoleResultEvidence } = await modulePromise;
  const result = compileProductionRoleResultEvidence(input());
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-role-results-race-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputs = Object.fromEntries(['ADMIN', 'MANAGER', 'USER'].map((role) => [role, path.join(root, `${role}.json`)]));
  const realLink = fs.linkSync.bind(fs);
  const io = {
    ...fs,
    linkSync(sourcePath, outputPath) {
      if (path.resolve(outputPath) === path.resolve(outputs.MANAGER)) {
        fs.writeFileSync(outputPath, '{"owner":"competing-run"}\n', { flag: 'wx' });
      }
      return realLink(sourcePath, outputPath);
    }
  };
  assert.throws(
    () => writeProductionRoleResultEvidence(outputs, result.documents, {
      repositoryRoot: path.join(root, 'different-repo'), processId: 1200, io
    }),
    /ROLE_RESULT_OUTPUT_SET_PARTIAL_COMMIT:1_OF_3/
  );
  assert.equal(JSON.parse(fs.readFileSync(outputs.ADMIN, 'utf8')).role, 'ADMIN');
  assert.deepEqual(JSON.parse(fs.readFileSync(outputs.MANAGER, 'utf8')), { owner: 'competing-run' });
  assert.equal(fs.existsSync(outputs.USER), false);
  assert.equal(fs.readdirSync(root).some((name) => name.endsWith('.tmp')), false);
});
